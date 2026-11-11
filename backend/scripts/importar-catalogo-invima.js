
const fs = require("node:fs");
const path = require("node:path");

const CSV_PATH = path.resolve(__dirname, "../data/catalogo_invima.csv");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseCsv(raw) {
  const records = [];
  let record = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
    } else {
      if (ch === '"' && value.length === 0) {
        inQuotes = true;
      } else if (ch === ",") {
        record.push(value.trim());
        value = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && raw[i + 1] === "\n") i++;
        record.push(value.trim());
        if (record.some(field => field !== "")) records.push(record);
        record = [];
        value = "";
      } else {
        value += ch;
      }
    }
  }

  if (inQuotes) throw new Error("El catálogo contiene un campo CSV sin cerrar.");
  record.push(value.trim());
  if (record.some(field => field !== "")) records.push(record);
  return records;
}

function readCsv(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const records = parseCsv(raw);
  if (!records.length) throw new Error("El catálogo CSV está vacío.");
  const headers = records[0];
  if (new Set(headers).size !== headers.length || headers.some(header => !header)) {
    throw new Error("Los encabezados del catálogo CSV no son válidos.");
  }

  return records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`Número de columnas incorrecto en fila ${index + 2}.`);
    }
    return {
      ...Object.fromEntries(headers.map((h, i) => [h, values[i]])),
      __line: index + 2
    };
  });
}

function validateCatalogRows(rows, expectedCount) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("El catálogo no contiene registros.");
  }
  if (expectedCount !== undefined && rows.length !== expectedCount) {
    throw new Error(`Se esperaban ${expectedCount} registros; encontrados: ${rows.length}`);
  }

  const required = [
    "cum", "consecutivo", "expediente", "producto",
    "principio_activo", "registro_sanitario",
    "estado_registro", "estado_cum", "muestra_medica",
    "modalidad", "titular"
  ];
  for (const column of required) {
    if (!(column in rows[0])) throw new Error(`Falta la columna ${column}`);
  }

  const seen = new Set();
  return rows.map((row, index) => {
    const cum = String(row.cum || "").trim();
    const consecutivo = String(row.consecutivo || "").trim();
    const sku = `INVIMA-CUM-${cum}-${consecutivo}`;
    const line = row.__line || index + 2;

    if (!cum || !consecutivo ||
        !String(row.producto || "").trim() ||
        !String(row.registro_sanitario || "").trim() ||
        !String(row.estado_registro || "").trim()) {
      throw new Error(`Datos incompletos en fila ${line}`);
    }
    if (String(row.estado_registro).trim().toLowerCase() !== "vigente" ||
        String(row.estado_cum).trim().toLowerCase() !== "activo" ||
        String(row.muestra_medica).trim().toLowerCase() !== "no") {
      throw new Error(`Estado INVIMA no válido en fila ${line}`);
    }
    if (seen.has(sku)) throw new Error(`Código duplicado: ${sku}`);
    seen.add(sku);

    return { ...row, cum, consecutivo, codigo_fuente: sku };
  });
}

function categoryFor(text) {
  const v = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const rules = [
    ["Vitaminas y suplementos", /VITAMIN|ACIDO ASCORBICO|COLECALCIFEROL|TIAMINA|PIRIDOXINA/],
    ["Analgésicos y antiinflamatorios", /ACETAMINOFEN|PARACETAMOL|IBUPROFENO|NAPROXENO|DICLOFENACO|KETOPROFENO|METAMIZOL/],
    ["Antialérgicos", /LORATADINA|CETIRIZINA|FEXOFENADINA|DESLORATADINA|LEVOCETIRIZINA/],
    ["Gastrointestinales", /OMEPRAZOL|ESOMEPRAZOL|PANTOPRAZOL|LANSOPRAZOL|SUCRALFATO|LOPERAMIDA|LACTULOSA/],
    ["Antigripales y respiratorios", /SALBUTAMOL|BUDESONIDA|AMBROXOL|ACETILCISTEINA|OXYMETAZOLINA|OXIMETAZOLINA/],
    ["Dermatológicos", /CLOTRIMAZOL|KETOCONAZOL|MICONAZOL|HIDROCORTISONA|BETAMETASONA|PERMETRINA/],
    ["Antibióticos", /AMOXICILINA|AZITROMICINA|CLARITROMICINA|CEFALEXINA|CIPROFLOXACINO|METRONIDAZOL|DOXICICLINA/],
    ["Salud cardiovascular", /LOSARTAN|ENALAPRIL|AMLODIPINO|ATORVASTATINA|SIMVASTATINA|FUROSEMIDA|HIDROCLOROTIAZIDA/],
    ["Salud femenina", /MEDROXIPROGESTERONA|LEVONORGESTREL|ETINILESTRADIOL|PROGESTERONA/],
    ["Salud masculina", /TADALAFILO|SILDENAFILO|FINASTERIDA/],
    ["Oftálmicos y óticos", /OFTALM|OCULAR|TOBRAMICINA|LATANOPROST|DEXTRAN/]
  ];

  return rules.find(([, re]) => re.test(v))?.[0] || "Otros medicamentos";
}

async function retry(operation, label, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const retryable = [
        "P1001", "P1002", "P1017", "P2024", "P2034"
      ].includes(error.code);

      if (!retryable || attempt === attempts) {
        throw error;
      }

      const delay = 2000 * attempt;
      console.log(
        `${label}: error temporal ${error.code}. ` +
        `Reintento ${attempt}/${attempts - 1} en ${delay} ms`
      );

      await sleep(delay);
    }
  }
}

async function importCatalog(rows, prisma, expectedCount) {
  const validatedRows = validateCatalogRows(rows, expectedCount);
  const categories = new Map();
  const codes = validatedRows.map(row => row.codigo_fuente);
  const products = [];

  for (const row of validatedRows) {
    const categoryName = categoryFor(`${row.producto} ${row.principio_activo}`);

    if (!categories.has(categoryName)) {
      const category = await retry(
        () => prisma.categoria.upsert({
          where: { nombre: categoryName },
          update: {},
          create: {
            nombre: categoryName,
            descripcion: "Clasificación de navegación del catálogo SaludClick."
          }
        }),
        `Categoría ${categoryName}`
      );

      categories.set(categoryName, category.id);
    }

    products.push({
      nombre: row.producto.trim().slice(0, 150),
      descripcion: row.producto.trim(),
      categoria_id: categories.get(categoryName),
      precio: 0,
      stock: 0,
      imagen: null,
      estado: "INACTIVO",
      codigo_fuente: row.codigo_fuente,
      expediente: row.expediente || null,
      nombre_generico: (row.principio_activo || "").slice(0, 180) || null,
      principio_activo: row.principio_activo || null,
      concentracion: (row.concentracion || "").slice(0, 120) || null,
      forma_farmaceutica: (row.forma_farmaceutica || "").slice(0, 120) || null,
      presentacion: (row.presentacion || "").slice(0, 180) || null,
      via_administracion: (row.via_administracion || "").slice(0, 120) || null,
      titular_registro: (row.titular || "").slice(0, 220) || null,
      registro_sanitario: row.registro_sanitario.trim().slice(0, 100),
      estado_registro_invima: row.estado_registro.trim(),
      modalidad_comercializacion: (row.modalidad || "").slice(0, 180) || null,
      cum: row.cum || null,
      ium: row.ium || null,
      requiere_formula: null,
      catalogo_verificado: false,
      precio_referencial: null,
      fuente_precio: null,
      fecha_precio: null
    });
  }

  const inserted = await retry(
    () => prisma.medicamento.createMany({
      data: products,
      skipDuplicates: true
    }),
    "Insertar medicamentos sin duplicar códigos INVIMA"
  );

  const total = await retry(
    () => prisma.medicamento.count({
      where: { codigo_fuente: { in: codes } }
    }),
    "Verificación final"
  );

  if (total !== validatedRows.length) {
    throw new Error("La importación quedó incompleta.");
  }

  return {
    created: inserted.count,
    skipped: validatedRows.length - inserted.count,
    total
  };
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) throw new Error("No se encontró el catálogo CSV.");
  const rows = readCsv(CSV_PATH);
  const prisma = require("../src/config/prisma");

  try {
    const result = await importCatalog(rows, prisma, 1000);
    console.log(`Catálogo validado: ${rows.length} registros.`);
    console.log(`Nuevos: ${result.created}`);
    console.log(`Omitidos por código existente: ${result.skipped}`);
    console.log(`Referencias verificadas: ${result.total}/1000`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseCsv,
  readCsv,
  validateCatalogRows,
  categoryFor,
  importCatalog
};
