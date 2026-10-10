export const process = {env:{}, nextTick:(f,...a)=>queueMicrotask(()=>f(...a)), browser:true, version:"", versions:{}};
