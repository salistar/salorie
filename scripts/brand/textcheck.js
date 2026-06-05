const sharp = require('sharp');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">
<rect width="400" height="120" fill="#298f50"/>
<text x="20" y="80" font-family="Arial, Segoe UI, sans-serif" font-size="64" font-weight="900" fill="#ffffff">Salorie</text>
</svg>`;
sharp(Buffer.from(svg)).png().toBuffer().then(async b=>{
  const stats = await sharp(b).stats();
  // measure non-background white pixels presence via mean of channels difference
  console.log('rendered bytes:', b.length);
  // crop the text area and check if any near-white pixels exist
  const {data,info} = await sharp(b).raw().toBuffer({resolveWithObject:true});
  let whitish=0;
  for(let i=0;i<data.length;i+=info.channels){
    if(data[i]>230&&data[i+1]>230&&data[i+2]>230) whitish++;
  }
  console.log('whitish pixels:', whitish, '(if >500, text rendered)');
}).catch(e=>console.error('ERR',e.message));
