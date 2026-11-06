export function cleanName(value){if(typeof value!=='string')return null;const name=value.trim();return name.length>=1&&name.length<=12&&!/[\u0000-\u001f\u007f]/.test(name)?name:null}
export function resetVillage(state){state.energy=0}
export function resetPersonalRecords(state){state.best={};state.queue=[];delete state.previousRankingBest;delete state.legacySurvivalBest}
export function freshPlayer(player,secret,epoch){return {player,secret,name:'',energy:0,best:{},queue:[],rankingEpoch:epoch,settings:{music:true,sound:true,vibrate:true}}}
