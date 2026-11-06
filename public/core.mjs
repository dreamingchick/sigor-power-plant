export const modes={speed:{name:'순간 발전',duration:10,base:70},endurance:{name:'지속 발전',duration:60,base:360},survival:{name:'블랙아웃 방어',duration:Infinity,base:90}};
export const thresholds=[0,100,300,700,1200,2000,3200,5000,7200,10000];
export const facilities=['작은 발전소','첫 가로등','농가의 불빛','논밭 길','물레방아','농가와 헛간','풍차','시골 장터','작은 기차역','마을회관과 광장'];
export function target(segment){return 20+4*Math.floor(segment/3)}
export function gauge(g,t,n){return Math.max(0,Math.min(100,g+(n>=t?(n-t):(n-t)*6)))}
export function score(best){return Math.round(((best.speed?.taps||0)/70+(best.endurance?.taps||0)/360+(best.survival?.duration||0)/90)*1000)}
export function better(mode,a,b){return !b||(mode==='survival'?(a.duration>b.duration||a.duration===b.duration&&a.taps>b.taps):a.taps>b.taps)}
export class TouchGate{constructor(){this.ids=new Set()}down(id){const ok=this.ids.size===0;this.ids.add(id);return ok}up(id){this.ids.delete(id)}clear(){this.ids.clear()}}