const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.json());
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'1234';
const adminTokens=new Set();
app.post('/api/admin-login',(req,res)=>{
 const pw=String(req.body?.password||'');
 if(pw!==ADMIN_PASSWORD)return res.status(401).json({ok:false,msg:'密碼錯誤'});
 const token=require('crypto').randomBytes(24).toString('hex');
 adminTokens.add(token);
 res.json({ok:true,token});
});
app.use(express.static('public'));
io.use((socket,next)=>{
 const token=String(socket.handshake.auth?.adminToken||'');
 socket.data.isAdmin=adminTokens.has(token);
 next();
});
const rooms=new Map();
const code=()=>String(Math.floor(100000+Math.random()*900000));
function onlineCount(r){return [...r.players.values()].filter(p=>p.online).length}
function clean(r){return {code:r.code,settings:r.settings,state:r.state,online:onlineCount(r),players:[...r.players.values()].map(p=>({name:p.name,score:p.score||0,time:p.time??null,done:!!p.done,online:!!p.online}))}}
function rank(r){return [...r.players.values()].sort((a,b)=>(b.score||0)-(a.score||0)||((a.time??1e12)-(b.time??1e12))).map((p,i)=>({name:p.name,score:p.score||0,time:p.time??null,done:!!p.done,rank:i+1}))}
function emit(r){io.to(r.code).emit('room',clean(r));io.to(r.code).emit('ranking',rank(r));}
function clearTimers(r){if(r.timer)clearTimeout(r.timer);if(r.countdownTimer)clearInterval(r.countdownTimer);if(r.gameTicker)clearInterval(r.gameTicker);r.timer=r.countdownTimer=r.gameTicker=null}
function finish(r,reason){if(!r||r.state==='finished')return;r.state='finished';clearTimers(r);emit(r);io.to(r.code).emit('finished',{reason,ranking:rank(r)});}
io.on('connection',s=>{
 s.on('createRoom',(settings,cb)=>{if(!s.data.isAdmin)return cb?.({ok:false,msg:'主控驗證失敗，請重新登入'});let c;do c=code();while(rooms.has(c));let r={code:c,settings,state:'waiting',players:new Map(),timer:null,countdownTimer:null,gameTicker:null};rooms.set(c,r);s.join(c);s.data.admin=c;emit(r);cb?.({ok:true,code:c});});
 s.on('saveSettings',({code,settings})=>{let r=rooms.get(code);if(r&&s.data.admin===code&&r.state==='waiting'){r.settings=settings;emit(r)}});
 s.on('join',({code,name},cb)=>{let r=rooms.get(String(code||''));if(!r)return cb?.({ok:false,msg:'找不到房間'});name=String(name||'').trim().slice(0,20);if(!name)return cb?.({ok:false,msg:'請輸入玩家名稱'});let key=name.toLowerCase();let p=r.players.get(key);if(!p){if(r.state!=='waiting')return cb?.({ok:false,msg:'遊戲已開始，無法加入新玩家'});p={name,score:0,time:null,done:false,online:true};r.players.set(key,p)}else p.online=true;s.join(r.code);s.data.room=r.code;s.data.key=key;emit(r);cb?.({ok:true,room:clean(r)});});
 s.on('start',({code})=>{let r=rooms.get(code);if(!r||s.data.admin!==code||r.state!=='waiting')return;clearTimers(r);r.state='countdown';for(const p of r.players.values()){p.score=0;p.time=null;p.done=false}const seconds=Math.max(1,Number(r.settings.startCountdown)||5);r.countdownEnds=Date.now()+seconds*1000;emit(r);let tick=()=>{let left=Math.max(0,Math.ceil((r.countdownEnds-Date.now())/1000));io.to(code).emit('countdownTick',left);if(left<=0){clearInterval(r.countdownTimer);r.countdownTimer=null;r.state='playing';r.started=Date.now();const ms=Math.max(1,Number(r.settings.gameMinutes)||3)*60000;r.gameEnds=r.started+ms;emit(r);io.to(code).emit('go',{settings:r.settings,seed:Math.floor(Math.random()*1e9),gameEnds:r.gameEnds});let gameTick=()=>{let remain=Math.max(0,r.gameEnds-Date.now());io.to(code).emit('gameTime',remain)};gameTick();r.gameTicker=setInterval(gameTick,1000);r.timer=setTimeout(()=>finish(r,'時間到'),ms)}};tick();r.countdownTimer=setInterval(tick,250);});
 s.on('progress',({score,time,done})=>{let r=rooms.get(s.data.room),p=r?.players.get(s.data.key);if(!r||!p||r.state!=='playing')return;p.score=Math.max(0,Number(score)||0);p.time=done?Math.max(0,Number(time)||0):null;p.done=!!done;emit(r);if(done){let n=[...r.players.values()].filter(x=>x.done).length,goal=r.settings.finishGoal;if(goal!=='all'){let g=Number(goal);if(g&&n>=g)finish(r,`前 ${g} 位完成`)}else if(r.players.size&&n===r.players.size)finish(r,'全部完成')}});
 s.on('deleteRoom',({code})=>{let r=rooms.get(code);if(r&&s.data.admin===code){clearTimers(r);io.to(code).emit('deleted');rooms.delete(code)}});
 s.on('disconnect',()=>{let r=rooms.get(s.data.room),p=r?.players.get(s.data.key);if(p){p.online=false;emit(r)}});
});
server.listen(process.env.PORT||3000,()=>console.log('Memory King running on '+(process.env.PORT||3000)));
