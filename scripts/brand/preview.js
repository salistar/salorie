const sharp=require('sharp');
const defs=`<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fc06f"/><stop offset="0.55" stop-color="#298f50"/><stop offset="1" stop-color="#175e34"/></linearGradient>
<linearGradient id="core" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>`;
// candidate flame outer paths (1024 vb) + matching inner
const cands=[
 { name:'A_leaning',
   o:`M512 120 C 600 250 690 330 720 470 C 742 575 720 620 700 660 A 300 300 0 1 1 250 640 C 250 540 300 470 360 400 C 440 310 470 250 470 180 C 486 240 500 220 512 120 Z`,
   i:`M520 440 C 575 520 632 560 656 640 C 672 700 648 740 600 760 A 150 150 0 1 1 372 720 C 380 660 410 610 452 566 C 500 520 510 500 520 440 Z`},
 { name:'B_notch',
   o:`M512 120 C 548 240 560 280 600 350 C 612 270 600 230 612 180 C 672 270 700 350 700 430 C 770 510 812 580 812 670 A 300 300 0 1 1 212 670 C 212 580 254 510 324 430 C 392 352 430 286 452 200 C 470 270 486 270 512 120 Z`,
   i:`M512 440 C 540 520 580 560 612 600 C 656 650 678 690 678 730 A 166 166 0 1 1 346 730 C 346 686 372 642 410 600 C 460 552 496 520 512 440 Z`},
 { name:'C_taper',
   o:`M512 110 C 565 230 700 320 720 480 C 735 600 700 700 600 740 C 660 690 666 620 640 560 C 612 620 560 650 520 650 C 590 590 560 470 500 410 C 512 500 470 540 430 580 C 400 540 396 500 410 460 C 360 510 320 590 320 660 A 230 230 0 1 0 720 560 L720 560 Z`,
   i:`M512 430 C 548 510 600 545 620 620 C 632 680 605 715 560 728 A 140 140 0 1 1 392 690 C 400 640 430 600 466 566 C 500 525 504 495 512 430 Z`},
];
function tile(c){
 return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="400" viewBox="0 0 360 400">${defs}
 <rect width="360" height="360" rx="80" fill="url(#bg)"/>
 <g transform="translate(180 180) scale(0.30) translate(-512 -568)"><path d="${c.o}" fill="#fff"/><path d="${c.i}" fill="url(#core)"/></g>
 <text x="180" y="392" font-family="Arial" font-size="22" font-weight="700" fill="#175e34" text-anchor="middle">${c.name}</text></svg>`;
}
(async()=>{
 const imgs=await Promise.all(cands.map(c=>sharp(Buffer.from(tile(c))).png().toBuffer()));
 const W=360*3;
 await sharp({create:{width:W,height:400,channels:4,background:'#ffffff'}})
  .composite(imgs.map((b,i)=>({input:b,left:i*360,top:0})))
  .png().toFile('out/preview.png');
 console.log('preview written');
})();
