const ExcelJS=require('exceljs');
const validator=require('../validators/farmacia-existencias.validator');
const {presentar}=require('./farmacia-existencias.service');
const {fallo}=require('../config/farmacia-operacion');
function safe(value){return String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,32767);}
async function generar(rows,now=new Date(),filters={},scope={tipo:'CATALOGO_GLOBAL'}) {
    const book=new ExcelJS.Workbook();book.creator='SaludClick';book.created=now;
    const sheet=book.addWorksheet('Inventario',{views:[{state:'frozen',ySplit:1}]});
    sheet.columns=[['Código',18],['Medicamento',38],['Descripción',60],['Presentación',32],['Cantidad',16],['Estado',24],['Fecha de generación',28]].map(([header,width])=>({header,width}));
    const propio=scope.tipo==='FARMACIA_PROPIA';
    if(propio)sheet.columns=[...sheet.columns.map(c=>({header:c.header,width:c.width})),{header:'Unidades entregadas',width:22},{header:'Reservadas',width:18},{header:'Existencias físicas',width:22}];
    const counts={total:rows.length,unidades:0,disponibles:0,agotados:0,bajos:0};
    for(const raw of rows){const med=presentar(raw);sheet.addRow([safe(med.codigo_fuente||med.id),safe(med.nombre),safe(med.descripcion),safe(med.presentacion),med.stock,safe(med.disponibilidad),now,...(propio?[med.entregados,med.reservado,med.fisico]:[])]);
        if(med.disponibilidad==='DISPONIBLE'){counts.unidades+=med.stock;counts.disponibles++;}if(med.disponibilidad==='AGOTADO')counts.agotados++;if(med.stockBajo)counts.bajos++;
    }
    sheet.autoFilter={from:'A1',to:`${propio?'J':'G'}${Math.max(1,sheet.rowCount)}`};sheet.getColumn(5).numFmt='#,##0';sheet.getColumn(7).numFmt='yyyy-mm-dd hh:mm';
    const summary=book.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:1}]});summary.columns=[{header:'SaludClick · Resumen de inventario',width:53},{header:'Valor',width:38}];
    for(const row of [['Alcance',propio?`Existencias propias de Farmacia #${scope.farmaciaId}`:'Catálogo global autorizado para consulta'],['Titularidad de farmacia',propio?'Acreditada mediante ingresos autorizados':'No acreditada; no es inventario propio'],['Resultados','Todos los resultados de los filtros aplicados'],['Total de medicamentos registrados',counts.total],['Total de unidades disponibles',counts.unidades],['Medicamentos disponibles',counts.disponibles],['Medicamentos agotados',counts.agotados],['Medicamentos con stock bajo (1–5)',counts.bajos],['Fecha y hora de generación',now]])summary.addRow(row);
    if(propio){for(const col of [8,9,10])sheet.getColumn(col).numFmt='#,##0';summary.addRow(['Unidades entregadas históricas',rows.reduce((n,r)=>n+r.entregados,0)]);summary.addRow(['Unidades reservadas',rows.reduce((n,r)=>n+r.reservado,0)]);}
    summary.addRow(['Filtros aplicados',safe(JSON.stringify({buscar:filters.buscar||'',disponibilidad:filters.disponibilidad||'todas',formula:filters.formula||'todas'}))]);
    summary.addRow(['Zona horaria de generación','UTC']);
    for(const ws of [sheet,summary]){ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'},size:12};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF145C45'}};ws.getRow(1).height=28;ws.headerFooter.oddHeader='SaludClick';ws.eachRow((row,n)=>{if(n>1){row.alignment={vertical:'top',wrapText:true};if(n%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEFF7F3'}};}});}
    summary.getCell('B10').numFmt='yyyy-mm-dd hh:mm';
    return Buffer.from(await book.xlsx.writeBuffer());
}
async function exportar(query,repo=require('../repositories/farmacia-existencias.repository')) {
    const options=validator.listado(query);const rows=await repo.exportar(options);
    if(rows.length>50000)throw fallo(413,'REPORTE_DEMASIADO_GRANDE','Reduce los filtros: el reporte admite hasta 50.000 registros.');
    return generar(rows,new Date(),options);
}
module.exports={safe,generar,exportar};
