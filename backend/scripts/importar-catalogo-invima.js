
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
let prisma;

const CSV_PATH = path.resolve(__dirname, "../data/catalogo_invima.csv");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(value.trim());
      value = "";
    } else {
      value += ch;
    }
  }

  out.push(value.trim());
  return out;
}

function readCsv(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(line => line.trim());
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    return {
      ...Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])),
      __line: index + 2
    };
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

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error("No se encontró el catálogo CSV.");
  }

  const rows = readCsv(CSV_PATH);

  if (rows.length !== 1000) {
    throw new Error(`Se esperaban 1000 registros; encontrados: ${rows.length}`);
  }

  const required = [
    "cum", "consecutivo", "expediente", "producto",
    "principio_activo", "registro_sanitario",
    "estado_registro", "estado_cum", "muestra_medica",
    "modalidad", "titular"
  ];

  for (const column of required) {
    if (!(column in rows[0])) {
      throw new Error(`Falta la columna ${column}`);
    }
  }

  const seen = new Set();

  for (const r of rows) {
    const sku = `INVIMA-CUM-${r.cum.trim()}-${r.consecutivo.trim()}`;

    if (!r.cum || !r.consecutivo || !r.producto ||
        !r.registro_sanitario || !r.estado_registro) {
      throw new Error(`Datos incompletos en fila ${r.__line}`);
    }

    if (r.estado_registro.toLowerCase() !== "vigente" ||
        r.estado_cum.toLowerCase() !== "activo" ||
        r.muestra_medica.toLowerCase() !== "no") {
      throw new Error(`Estado INVIMA no válido en fila ${r.__line}`);
    }

    if (seen.has(sku)) {
      throw new Error(`Código duplicado: ${sku}`);
    }

    seen.add(sku);
  }

  console.log(`Catálogo validado: ${rows.length} registros.`);

  // Permite verificar el entregable sin credenciales ni conexión a Neon.
  if (process.argv.includes("--validar")) return;
  prisma = require("../src/config/prisma");

  const existing = await retry(
    () => prisma.medicamento.findMany({
      where: { codigo_fuente: { in: [...seen] } },
      select: { codigo_fuente: true }
    }),
    "Consultar medicamentos existentes"
  );

  const existingCodes = new Set(existing.map(m => m.codigo_fuente));

  console.log(`Ya registrados: ${existingCodes.size}`);
  console.log(`Pendientes: ${rows.length - existingCodes.size}`);

  const categories = new Map();
  let created = 0;
  let skipped = 0;

  for (const r of rows) {
    const sku = `INVIMA-CUM-${r.cum.trim()}-${r.consecutivo.trim()}`;

    if (existingCodes.has(sku)) {
      skipped++;
      continue;
    }

    const categoryName = categoryFor(`${r.producto} ${r.principio_activo}`);

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

    const data = {
      nombre: r.producto.trim().slice(0, 150),
      descripcion: r.producto.trim(),
      categoria_id: categories.get(categoryName),
      precio: 0,
      stock: 0,
      imagen: null,
      estado: "INACTIVO",
      codigo_fuente: sku,
      expediente: r.expediente || null,
      nombre_generico: (r.principio_activo || "").slice(0, 180) || null,
      principio_activo: r.principio_activo || null,
      concentracion: (r.concentracion || "").slice(0, 120) || null,
      forma_farmaceutica: (r.forma_farmaceutica || "").slice(0, 120) || null,
      presentacion: (r.presentacion || "").slice(0, 180) || null,
      via_administracion: (r.via_administracion || "").slice(0, 120) || null,
      titular_registro: (r.titular || "").slice(0, 220) || null,
      registro_sanitario: r.registro_sanitario.trim().slice(0, 100),
      estado_registro_invima: r.estado_registro.trim(),
      modalidad_comercializacion: (r.modalidad || "").slice(0, 180) || null,
      cum: r.cum || null,
      ium: r.ium || null,
      requiere_formula: null,
      catalogo_verificado: false,
      precio_referencial: null,
      fuente_precio: null,
      fecha_precio: null
    };

    await retry(
      () => prisma.medicamento.upsert({
        where: { codigo_fuente: sku },
        update: {},
        create: data
      }),
      `Medicamento ${sku}`
    );

    created++;

    if (created % 25 === 0) {
      console.log(
        `Progreso: ${created} nuevos | ${skipped} existentes omitidos`
      );
    }
  }

  const total = await retry(
    () => prisma.medicamento.count({
      where: {
        codigo_fuente: { in: [...seen] }
      }
    }),
    "Verificación final"
  );

  console.log("\nIMPORTACIÓN FINALIZADA");
  console.log(`Nuevos: ${created}`);
  console.log(`Omitidos: ${skipped}`);
  console.log(`Referencias del CSV en Neon: ${total}/1000`);

  if (total !== 1000) {
    throw new Error("La importación quedó incompleta.");
  }
}

if (require.main === module) main()
  .catch(error => {
    console.error("ERROR:", prisma ? `Falló la importación (${error.code || error.name}).` : error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });

module.exports = { readCsv, parseCsvLine, categoryFor };
