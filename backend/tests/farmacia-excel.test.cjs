require('./support/isolate-database.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');const ExcelJS=require('exceljs');
const service=require('../src/services/farmacia-excel.service');
test('Excel real: dos hojas, cifras, filtros, congelación y texto sin fórmulas ejecutables',async()=>{
    const rows=[{id:1,nombre:'=HYPERLINK("https://evil")',descripcion:'+cmd',presentacion:'Caja',stock:3,estado:'DISPONIBLE',requiere_formula:false},{id:2,nombre:'Agotado',stock:0,estado:'AGOTADO'},{id:3,nombre:'Inconsistente',stock:-10,estado:'DISPONIBLE'}];
    const buffer=await service.generar(rows,new Date('2026-11-16T12:00:00Z'));assert.equal(buffer.subarray(0,2).toString(),'PK');
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);
    assert.deepEqual(workbook.worksheets.map(w=>w.name),['Inventario','Resumen']);
    const ws=workbook.getWorksheet('Inventario');assert.equal(ws.getCell('B2').value,rows[0].nombre);assert.equal(ws.getCell('B2').type,ExcelJS.ValueType.String);assert.equal(ws.getCell('E2').value,3);
    assert.equal(ws.views[0].ySplit,1);assert.ok(ws.autoFilter);assert.equal(ws.getCell('A1').font.bold,true);
    const summary=workbook.getWorksheet('Resumen');assert.equal(summary.getCell('B5').value,3);assert.equal(summary.getCell('B6').value,3);assert.equal(summary.getCell('B7').value,1);assert.equal(summary.getCell('B8').value,1);assert.equal(summary.getCell('B9').value,1);
});
test('Excel: exporta todos los resultados filtrados sin limitar a la página y admite vacíos',async()=>{
    let received;const buffer=await service.exportar({buscar:'A',disponibilidad:'agotados',pagina:'2'}, {exportar:async o=>{received=o;return [];}});
    assert.equal(received.buscar,'A');assert.equal(received.disponibilidad,'agotados');
    const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);assert.equal(book.getWorksheet('Inventario').rowCount,1);assert.equal(book.getWorksheet('Resumen').getCell('B5').value,0);
    await assert.rejects(service.exportar({farmaciaId:'otra'},{exportar:()=>assert.fail('No autorizado')}),{status:400});
});
test('Validadores: URL peligrosa, sobreasignación de stock, filtros y recepción inválidos',()=>{
    const v=require('../src/validators/farmacia-operacion.validator');
    for(const url of ['http://images.example.com/a','https://127.0.0.1/a','https://localhost/a','https://u:p@images.example.com/a','file:///etc/passwd','javascript:alert(1)'])assert.throws(()=>v.imagen(url),{status:400});
    assert.throws(()=>v.listado({desde:'2026-02-31'}),{status:400});assert.throws(()=>v.listado({farmaciaId:'4'}),{status:400});
    assert.throws(()=>v.medicamento({stock:100}),{status:400});
    assert.throws(()=>v.transicion({estadoActual:'LISTA',estado:'ENTREGADA',version:1,clave:require('node:crypto').randomUUID()}),{status:400});
});
