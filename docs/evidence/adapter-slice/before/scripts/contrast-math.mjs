// WCAG 2 relative luminance; input channels are unrounded sRGB 0..255.
export function composite(f, b) {
 const a=f[3]+b[3]*(1-f[3]);
 return a ? [...f.slice(0,3).map((v,i)=>(v*f[3]+b[i]*b[3]*(1-f[3]))/a),a] : [0,0,0,0];
}
export function contrast(a,b) {
 const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const x=lum(a),y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export const threshold=(size,weight)=>size>=24 || (size>=56/3 && weight>=700) ? 3 : 4.5;
export function measure({color,layers}) {
 let foreground=color,background=[0,0,0,0];
 for(const layer of layers) {
  foreground=composite(foreground,layer.background);
  background=composite(background,layer.background);
  foreground[3]*=layer.opacity; background[3]*=layer.opacity;
 }
 foreground=composite(foreground,[255,255,255,1]);
 background=composite(background,[255,255,255,1]);
 return {foreground,background,ratio:contrast(foreground,background)};
}
