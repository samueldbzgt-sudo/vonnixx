import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultTrackingFile,normalizeTrackingRecords,readTrackingRecords } from './tracking-store.mjs';

const args=process.argv.slice(2);
if(!args.length||args.includes('--ajuda')){
  console.log('Uso: node tools/importar-rastreios.mjs arquivo.json [--validar]\n\nImporta uma lista de rastreios reais para a base privada .data/rastreios.json.\nCampos: tracking_code, email (opcional), current_status, current_status_label,\ncreated_at, updated_at, next_attempt_date, milestones e timeline.\nDatas devem usar ISO 8601. Cada milestone usa short, completed e isCurrent.\nCada evento usa label, status, timestamp e isCurrent.\n\n--validar verifica o arquivo sem gravar. Não envie senhas nem dados de pagamento.');
}else{
  try{
    const file=args.find(value=>!value.startsWith('--'));
    const imported=normalizeTrackingRecords(JSON.parse(await fs.readFile(path.resolve(file),'utf8')));
    if(args.includes('--validar'))console.log('Arquivo válido: '+imported.length+' rastreio(s). Nenhum dado gravado.');
    else{
      const previous=await readTrackingRecords();
      const merged=new Map(previous.map(item=>[item.tracking_code,item]));
      for(const record of imported)merged.set(record.tracking_code,record);
      await fs.mkdir(path.dirname(defaultTrackingFile),{recursive:true});
      if(previous.length){const backupDir=path.join(path.dirname(defaultTrackingFile),'backups');await fs.mkdir(backupDir,{recursive:true});await fs.copyFile(defaultTrackingFile,path.join(backupDir,'rastreios-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'));}
      const temp=defaultTrackingFile+'.tmp-'+process.pid;
      await fs.writeFile(temp,JSON.stringify([...merged.values()],null,2)+'\n',{flag:'wx'});
      await fs.rename(temp,defaultTrackingFile);
      console.log('Importação concluída: '+imported.length+' rastreio(s); '+merged.size+' registro(s) na base privada.');
    }
  }catch(error){console.error('Importação interrompida: '+error.message);process.exitCode=1;}
}
