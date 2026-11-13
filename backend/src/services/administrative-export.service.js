function cell(value) {
    let text=value==null?'':value instanceof Date?value.toISOString():String(value);
    // Spreadsheet formula injection, including leading control/whitespace.
    if(/^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
}
function csv(report) {
    const keys=report.columnas||Object.keys(report.filas[0]||{});
    return '\uFEFF'+[keys.map(cell).join(','),...report.filas.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n');
}
function pdf(report) {
    // Minimal paginated PDF with deterministic text, no browser/remote service.
    const ascii=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,' ').replace(/([\\()])/g,'\\$1');
    const lines=[`SaludClick - Informe ${report.tipo}`,`Generado: ${report.generadoEn}`,`Desde: ${report.filtros?.desde||'inicio'}  Hasta: ${report.filtros?.hasta||'hoy'}`,`Busqueda: ${report.filtros?.buscar||'todas'}`,`Registros: ${report.filas.length}${report.limitado?' - LIMITE ALCANZADO: acota las fechas':''}`,''];
    if(report.resumen) lines.push(`Total filtrado: ${report.resumen.total}`);
    if(report.resumen?.cuentas_acceso!==undefined)lines.push(`Cuentas de acceso: ${report.resumen.cuentas_acceso} | Afiliados EPS: ${report.resumen.afiliados_eps} | Coincidencias ya incluidas: ${report.resumen.coincidencias}`);
    if(report.aviso)lines.push(report.aviso);
    if(!report.filas.length) lines.push('No hay resultados para esta consulta.');
    for(const [index,row] of report.filas.entries()) {
        lines.push(`Registro ${index+1}`);
        for(const [key,value] of Object.entries(row)) {
            const text=`${key}: ${value instanceof Date?value.toISOString():value??''}`;
            for(let i=0;i<text.length;i+=105) lines.push(text.slice(i,i+105));
        }
        lines.push('');
    }
    const pages=[]; for(let i=0;i<lines.length;i+=48)pages.push(lines.slice(i,i+48));
    const objects=['','<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const kids=[];
    for(const [index,page] of pages.entries()) {
        const pageId=objects.length, streamId=pageId+1;kids.push(`${pageId} 0 R`);
        const stream=`BT /F1 9 Tf 40 800 Td 14 TL ${page.map((line,i)=>`${i?'T* ':''}(${ascii(line)}) Tj`).join('\n')}\nT* (Pagina ${index+1} de ${pages.length}) Tj ET`;
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    }
    objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
    let output='%PDF-1.4\n',offsets=[0];
    for(let i=1;i<objects.length;i++){offsets.push(Buffer.byteLength(output));output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
    const xref=Buffer.byteLength(output);
    output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(output);
}
module.exports={cell,csv,pdf};
