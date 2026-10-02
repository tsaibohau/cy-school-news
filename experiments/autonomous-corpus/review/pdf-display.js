// Display-only removal; immutable parsed text and citation locators are unchanged.
function cleanPdfDisplay(value) {
  const lines=String(value).split('\n');
  const dot=/^[.．·…。\-─\s]+$/;
  const markers=['裝','訂','線'].map(word=>lines.findIndex(line=>line.trim()===word));
  const remove=new Set();
  if(markers.every(i=>i>=0)&&markers[0]<markers[1]&&markers[1]<markers[2]) {
    let start=markers[0],end=markers[2];
    while(start>0&&(dot.test(lines[start-1])||!lines[start-1].trim()))start--;
    while(end+1<lines.length&&(dot.test(lines[end+1])||!lines[end+1].trim()))end++;
    const region=lines.slice(start,end+1);
    if(region.filter(line=>dot.test(line)&&line.trim()).length>=6&&region.every(line=>dot.test(line)||!line.trim()||['裝','訂','線'].includes(line.trim()))) {
      for(let i=start;i<=end;i++)remove.add(i);
    }
  }
  const horizontal=/^[.．·…。\-─\s]*裝[.．·…。\-─\s]*訂[.．·…。\-─\s]*線[.．·…。\-─\s]*$/;
  return lines.filter((line,i)=>!remove.has(i)&&!horizontal.test(line)).join('\n').trim();
}
if(typeof module!=='undefined')module.exports={cleanPdfDisplay};
