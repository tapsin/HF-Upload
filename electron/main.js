const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const isDev = !app.isPackaged;
const tokenFile = () => path.join(app.getPath('userData'), 'hf-token.bin');
function createWindow() {
  const win = new BrowserWindow({ width: 1240, height: 820, minWidth: 980, minHeight: 650, backgroundColor: '#090b10', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  if (isDev) win.loadURL('http://127.0.0.1:5173'); else win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => {
  ipcMain.handle('pick-files', async () => (await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })).filePaths);
  ipcMain.handle('token-read', async () => { const file = tokenFile(); if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) return ''; return safeStorage.decryptString(fs.readFileSync(file)); });
  ipcMain.handle('token-save', async (_event, token) => { if (!token) return; if (!safeStorage.isEncryptionAvailable()) throw new Error('İşletim sistemi güvenli saklama alanı kullanılamıyor.'); fs.mkdirSync(path.dirname(tokenFile()), { recursive: true }); fs.writeFileSync(tokenFile(), safeStorage.encryptString(token)); });
  ipcMain.handle('token-delete', async () => { const file = tokenFile(); if (fs.existsSync(file)) fs.unlinkSync(file); });
  ipcMain.handle('convert-csv-dataset', async (_event, { csvPath }) => {
    if (!csvPath || !csvPath.toLowerCase().endsWith('.csv')) throw new Error('Lütfen CSV dosyası seçin.');
    const source = fs.readFileSync(csvPath, 'utf8');
    const folder = path.join(path.dirname(csvPath), `${path.basename(csvPath, path.extname(csvPath))}-dataset`);
    fs.mkdirSync(folder, { recursive: true });
    const csvName = path.basename(csvPath);
    fs.copyFileSync(csvPath, path.join(folder, csvName));
    const firstLine = source.split(/\r?\n/).find(line => line.trim()) || '';
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    const columns = firstLine.split(delimiter).map(value => value.trim().replace(/^['"]|['"]$/g, ''));
    fs.writeFileSync(path.join(folder, 'dataset_info.json'), JSON.stringify({ builder_name: 'csv', config_name: 'default', description: 'Created by HF Upload', features: columns.map(name => ({ name, dtype: 'string' })) }, null, 2));
    fs.writeFileSync(path.join(folder, 'state.json'), JSON.stringify({ source_file: csvName, rows: Math.max(0, source.split(/\r?\n/).filter(Boolean).length - 1), columns, delimiter }, null, 2));
    fs.writeFileSync(path.join(folder, 'README.md'), `---\npretty_name: ${path.basename(csvPath, '.csv')}\n---\n\n# Dataset\n\nThis dataset was prepared with HF Upload from **${csvName}**.\n`);
    return folder;
  });
  ipcMain.handle('convert-csv-jsonl', async (_event, { csvPath }) => {
    const text=fs.readFileSync(csvPath,'utf8').replace(/^\uFEFF/,''); const lines=text.split(/\r?\n/).filter(Boolean); if(lines.length<2)throw new Error('CSV başlık ve en az bir satır içermeli.'); const delimiter=lines[0].includes(';')&&!lines[0].includes(',')?';':','; const headers=lines[0].split(delimiter).map(x=>x.trim().replace(/^['"]|['"]$/g,'')); const rows=lines.slice(1).map(line=>line.split(delimiter).map(x=>x.trim().replace(/^['"]|['"]$/g,''))); const output=path.join(path.dirname(csvPath),`${path.basename(csvPath,'.csv')}.jsonl`); fs.writeFileSync(output,rows.map(row=>JSON.stringify(Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])))).join('\n')+'\n'); return output;
  });
  ipcMain.handle('convert-csv-parquet', async (_event, { csvPath }) => {
    if (!csvPath || !csvPath.toLowerCase().endsWith('.csv')) throw new Error('Lütfen CSV dosyası seçin.');
    const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV başlık ve en az bir satır içermeli.');
    const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(x => x.trim().replace(/^['"]|['"]$/g, ''));
    const rows = lines.slice(1).map(line => line.split(delimiter).map(x => x.trim().replace(/^['"]|['"]$/g, '')));
    const columns = Object.fromEntries(headers.map((header, i) => [header, rows.map(row => row[i] ?? '')]));
    const arrow = await import('apache-arrow'); const parquet = await import('parquet-wasm');
    const table = arrow.tableFromArrays(columns); const wasmTable = parquet.Table.fromIPCStream(arrow.tableToIPC(table, 'stream')); const bytes = parquet.writeParquet(wasmTable);
    const output = path.join(path.dirname(csvPath), `${path.basename(csvPath, '.csv')}.parquet`); fs.writeFileSync(output, Buffer.from(bytes)); return output;
  });
  ipcMain.handle('convert-csv-yolo', async (_event, { csvPath }) => {
    const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''); const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) throw new Error('CSV boş.');
    const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','; const header = lines[0].split(delimiter).map(x=>x.trim().toLowerCase()); const at = n => { const i=header.indexOf(n); if(i<0) throw new Error(`CSV alanı eksik: ${n}`); return i; };
    const indexes = { image: at('image'), x: at('x'), y: at('y'), width: at('width'), height: at('height'), class: at('class'), imageWidth: at('image_width'), imageHeight: at('image_height') }; const rows=lines.slice(1).map(line=>line.split(delimiter).map(x=>x.trim().replace(/^['"]|['"]$/g,'')));
    const folder=path.join(path.dirname(csvPath),`${path.basename(csvPath,'.csv')}-yolo`); const labels=path.join(folder,'labels'); const images=path.join(folder,'images'); fs.mkdirSync(labels,{recursive:true}); fs.mkdirSync(images,{recursive:true}); const classes=[]; const grouped={};
    for(const row of rows){const image=row[indexes.image];const cls=row[indexes.class];if(!classes.includes(cls))classes.push(cls);const iw=Number(row[indexes.imageWidth]),ih=Number(row[indexes.imageHeight]);const x=Number(row[indexes.x]),y=Number(row[indexes.y]),w=Number(row[indexes.width]),h=Number(row[indexes.height]);if(![iw,ih,x,y,w,h].every(Number.isFinite)||iw<=0||ih<=0)throw new Error(`Geçersiz koordinat: ${image}`);const line=`${classes.indexOf(cls)} ${((x+w/2)/iw).toFixed(6)} ${((y+h/2)/ih).toFixed(6)} ${(w/iw).toFixed(6)} ${(h/ih).toFixed(6)}`;const key=path.basename(image,path.extname(image));grouped[key]=(grouped[key]||[]).concat(line);}
    Object.entries(grouped).forEach(([name,items])=>fs.writeFileSync(path.join(labels,`${name}.txt`),items.join('\n')+'\n')); fs.writeFileSync(path.join(folder,'classes.txt'),classes.join('\n')+'\n'); fs.writeFileSync(path.join(folder,'data.yaml'),`path: .\ntrain: images\nval: images\nnames: [${classes.map(c=>`'${c.replace(/'/g,"''")}'`).join(', ')}]\n`); fs.writeFileSync(path.join(folder,'conversion-report.json'),JSON.stringify({source:csvPath,format:'YOLO',rows:rows.length,classes,warning:'Images are not copied; place them in images/.'},null,2)); return folder;
  });
  ipcMain.handle('convert-csv-annotations', async (_event, { csvPath, format }) => {
    const text=fs.readFileSync(csvPath,'utf8').replace(/^\uFEFF/,''); const lines=text.split(/\r?\n/).filter(Boolean); const delimiter=lines[0].includes(';')&&!lines[0].includes(',')?';':','; const header=lines[0].split(delimiter).map(x=>x.trim().toLowerCase()); const idx=n=>{const i=header.indexOf(n);if(i<0)throw new Error(`CSV alanı eksik: ${n}`);return i}; const ix={image:idx('image'),x:idx('x'),y:idx('y'),width:idx('width'),height:idx('height'),class:idx('class'),imageWidth:idx('image_width'),imageHeight:idx('image_height')}; const rows=lines.slice(1).map(l=>l.split(delimiter).map(x=>x.trim().replace(/^['"]|['"]$/g,''))); const folder=path.join(path.dirname(csvPath),`${path.basename(csvPath,'.csv')}-${format.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`); fs.mkdirSync(folder,{recursive:true}); const classes=[...new Set(rows.map(r=>r[ix.class]))]; const annotations=rows.map((r,i)=>({id:i+1,image:r[ix.image],category:r[ix.class],bbox:[+r[ix.x],+r[ix.y],+r[ix.width],+r[ix.height]],width:+r[ix.imageWidth],height:+r[ix.imageHeight]}));
    if(format==='COCO'){fs.writeFileSync(path.join(folder,'annotations.json'),JSON.stringify({images:[...new Map(annotations.map(a=>[a.image,{id:a.image,file_name:a.image,width:a.width,height:a.height}])).values()],annotations:annotations.map(a=>({id:a.id,image_id:a.image,category_id:classes.indexOf(a.category)+1,bbox:a.bbox,area:a.bbox[2]*a.bbox[3],iscrowd:0})),categories:classes.map((name,i)=>({id:i+1,name}))},null,2));}
    else if(format==='CreateML'){fs.writeFileSync(path.join(folder,'annotations.json'),JSON.stringify(annotations.reduce((o,a)=>(o[a.image]??=[]).push({label:a.category,coordinates:{x:a.bbox[0]+a.bbox[2]/2,y:a.bbox[1]+a.bbox[3]/2,width:a.bbox[2],height:a.bbox[3]}})&&o,{}),null,2));}
    else if(format==='Label Studio'){fs.writeFileSync(path.join(folder,'tasks.json'),JSON.stringify(annotations.map(a=>({data:{image:a.image},predictions:[{result:[{type:'rectanglelabels',from_name:'label',to_name:'image',value:{x:a.bbox[0]/a.width*100,y:a.bbox[1]/a.height*100,width:a.bbox[2]/a.width*100,height:a.bbox[3]/a.height*100,rectanglelabels:[a.category]}}]}]})),null,2));}
    else if(format==='Pascal VOC'){const xml=x=>`<annotation><filename>${x.image}</filename><size><width>${x.width}</width><height>${x.height}</height><depth>3</depth></size><object><name>${x.category}</name><bndbox><xmin>${x.bbox[0]}</xmin><ymin>${x.bbox[1]}</ymin><xmax>${x.bbox[0]+x.bbox[2]}</xmax><ymax>${x.bbox[1]+x.bbox[3]}</ymax></bndbox></object></annotation>`; const grouped={};annotations.forEach(a=>(grouped[a.image]??=[]).push(a));fs.mkdirSync(path.join(folder,'Annotations'),{recursive:true});Object.entries(grouped).forEach(([image,items])=>fs.writeFileSync(path.join(folder,'Annotations',`${path.basename(image,path.extname(image))}.xml`),xml(items[0])));}
    else throw new Error(`Desteklenmeyen annotation formatı: ${format}`); fs.writeFileSync(path.join(folder,'conversion-report.json'),JSON.stringify({source:csvPath,format,rows:rows.length,classes},null,2)); return folder;
  });
  ipcMain.handle('convert-dicom-series', async (_event, { files }) => {
    if (!files?.length) throw new Error('DICOM seri dosyası seçin.');
    const folder = path.join(path.dirname(files[0]), `${path.basename(files[0], path.extname(files[0]))}-dicom-series`); fs.mkdirSync(folder, { recursive: true });
    const copied=[]; for (const file of files) { const name=path.basename(file); const output=path.join(folder,name); fs.copyFileSync(file,output); copied.push(name); }
    fs.writeFileSync(path.join(folder,'conversion-report.json'), JSON.stringify({format:'DICOM Series', files:copied, anonymization:'not applied automatically; original files preserved', createdAt:new Date().toISOString()},null,2));
    fs.writeFileSync(path.join(folder,'README.md'),'# DICOM Series\n\nOriginal DICOM files were copied without modifying source files. Review and anonymize patient metadata before sharing.\n'); return folder;
  });
  ipcMain.handle('upload-files', async (_event, { token, repo, target, files }) => {
    if (!token || !repo || !repo.includes('/')) throw new Error('Token ve kullanıcı/repository bilgisi gerekli.');
    const { uploadFiles } = await import('@huggingface/hub');
    const repoType = target === 'model' ? 'model' : 'dataset';
    await uploadFiles({
      repo: { type: repoType, name: repo },
      accessToken: token,
      files: files.map(file => ({ path: file.name, content: pathToFileURL(file.path) })),
      commitTitle: 'Upload with HF Upload'
    });
    return files.map(file => file.name);
  });
  createWindow(); app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
