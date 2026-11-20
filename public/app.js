import * as THREE from "three";

const socket = io();
const statusText = document.getElementById("statusText");
const livePill = document.querySelector(".live-pill");
const note = document.getElementById("connectionNote");
const errorBox = document.getElementById("errorBox");
const connectBtn = document.getElementById("connectBtn");
const eventsEl = document.getElementById("events");
const eventCountEl = document.getElementById("eventCount");
const avatarCountEl = document.getElementById("avatarCount");
const avatars = new Map();
let eventCount = 0, giftCount = 0, likeCount = 0;

function setStatus(status, username, message) {
  const labels = { disconnected:"DESCONECTADO", connecting:"CONECTANDO…", connected:"CONECTADO", error:"ERRO NA CONEXÃO" };
  statusText.textContent = labels[status] || status.toUpperCase();
  livePill.classList.toggle("connected", status === "connected");
  connectBtn.disabled = status === "connecting";
  connectBtn.textContent = status === "connecting" ? "CONECTANDO…" : "CONECTAR ↗";
  if (status === "connected") {
    note.textContent = `Conectado à LIVE de @${username}. Eventos reais serão exibidos aqui.`;
    errorBox.hidden = true;
  } else if (message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    note.textContent = "Não foi possível confirmar a conexão.";
  } else if (status === "disconnected") {
    note.textContent = "Digite o @ da conta que está transmitindo ao vivo. Não precisa colocar senha.";
  }
}
socket.on("connection-status", data => setStatus(data.status, data.username, data.message));

document.getElementById("connectForm").addEventListener("submit", async e => {
  e.preventDefault();
  errorBox.hidden = true;
  const username = document.getElementById("username").value.trim();
  if (!username) return;
  connectBtn.disabled = true;
  connectBtn.textContent = "CONECTANDO…";
  note.textContent = "Procurando uma transmissão pública ativa…";
  try {
    const response = await fetch("/api/connect", {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error + (data.hint ? " " + data.hint : ""));
    setStatus("connected", data.username);
  } catch (err) {
    setStatus("error", username, err.message);
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = "CONECTAR ↗";
  }
});

function addEvent(type, data = {}) {
  eventCount++;
  eventCountEl.textContent = eventCount;
  const icons = {member:"👋",chat:"💬",gift:"🎁",like:"💜"};
  const title = {member:"Entrou na LIVE",chat:"Comentou",gift:"Enviou presente",like:"Curtiu"}[type] || "Evento";
  const name = data.username || "Espectador";
  let detail = data.text || data.giftName || (type === "like" ? `${data.count || 1} curtidas` : "");
  const item = document.createElement("div");
  item.className = "event";
  const icon = document.createElement("span"); icon.className="event-icon"; icon.textContent=icons[type]||"✨";
  const body = document.createElement("div");
  const strong = document.createElement("strong"); strong.textContent = `${name} — ${title}`;
  const small = document.createElement("small"); small.textContent = detail;
  body.append(strong, small); item.append(icon, body);
  if (eventsEl.querySelector(".empty-state")) eventsEl.innerHTML = "";
  eventsEl.prepend(item);
  while (eventsEl.children.length > 35) eventsEl.lastElementChild.remove();

  if (type === "member") addAvatar(name);
  if (type === "gift") { giftCount += Number(data.count || 1); document.getElementById("gifts").textContent = giftCount; }
  if (type === "like") { likeCount += Number(data.count || 1); document.getElementById("likes").textContent = likeCount; }
}
socket.on("live-event", ({type,data}) => addEvent(type,data));

const stage = document.getElementById("stage");
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x10172b, 14, 32);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 5.4, 14);
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xb8d7ff, 0x26203c, 2.1));
const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-5,9,7); key.castShadow=true; scene.add(key);
const rim = new THREE.PointLight(0x68e1d2, 32, 18); rim.position.set(5,4,-3); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(13,64), new THREE.MeshStandardMaterial({color:0x18223a,roughness:.8,metalness:.15}));
floor.rotation.x=-Math.PI/2; floor.position.y=-.04; floor.receiveShadow=true; scene.add(floor);
const grid = new THREE.GridHelper(24,32,0x3a6780,0x26334e); grid.position.y=-.025; scene.add(grid);
const ring = new THREE.Mesh(new THREE.TorusGeometry(5.1,.025,8,100),new THREE.MeshBasicMaterial({color:0x68e1d2,transparent:true,opacity:.5}));
ring.rotation.x=Math.PI/2; ring.position.y=.02; scene.add(ring);

function material(color, roughness=.72){return new THREE.MeshStandardMaterial({color,roughness});}
function makeAvatar(name,index) {
  const group = new THREE.Group();
  const skin = material(0xc98e69), shirt = material([0x6ce0d0,0x9b85ff,0xffbd72,0x70a8ff,0xf17ca9][index%5]), pants=material(0x202943), shoes=material(0x101522);
  const sphere = (parent,mat,pos,scale) => {const m=new THREE.Mesh(new THREE.SphereGeometry(1,20,16),mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;parent.add(m);return m;};
  const limb = (parent,mat,a,b,r1,r2) => {const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,d.length(),12),mat);mesh.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());mesh.castShadow=true;parent.add(mesh);return mesh;};
  sphere(group,shirt,[0,1.45,0],[.48,.65,.27]);
  sphere(group,skin,[0,2.32,0],[.34,.39,.32]);
  sphere(group,material(0x24202a),[0,2.58,-.025],[.35,.2,.33]);
  sphere(group,material(0x24202a),[-.32,2.34,0],[.07,.13,.08]);sphere(group,material(0x24202a),[.32,2.34,0],[.07,.13,.08]);
  sphere(group,material(0xffffff),[-.12,2.37,.29],[.055,.045,.025]);sphere(group,material(0xffffff),[.12,2.37,.29],[.055,.045,.025]);
  sphere(group,material(0x20202a),[-.12,2.37,.315],[.022,.03,.012]);sphere(group,material(0x20202a),[.12,2.37,.315],[.022,.03,.012]);
  sphere(group,skin,[0,2.25,.31],[.045,.07,.045]);
  const arms=[], legs=[];
  for(const side of [-1,1]){
    arms.push(limb(group,skin,[side*.43,1.83,0],[side*.72,1.15,0],.12,.085));
    sphere(group,skin,[side*.72,1.12,0],[.095,.12,.09]);
    legs.push(limb(group,pants,[side*.19,.92,0],[side*.2,.3,0],.16,.105));
    sphere(group,shoes,[side*.2,.12,.08],[.14,.12,.24]);
  }
  // etiqueta de nome no palco
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=96;
  const ctx=canvas.getContext("2d");ctx.fillStyle="rgba(7,12,24,.82)";ctx.roundRect(4,8,504,80,22);ctx.fill();
  ctx.strokeStyle="#68e1d2";ctx.lineWidth=3;ctx.stroke();
  ctx.font="bold 34px Arial";ctx.textAlign="center";ctx.fillStyle="#ffffff";ctx.fillText(name.slice(0,22),256,61);
  const tex=new THREE.CanvasTexture(canvas);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));
  label.position.y=3.05;label.scale.set(2.3,.43,1);group.add(label);
  group.userData={arms,legs,phase:Math.random()*6.28};
  scene.add(group);
  const col=index%4,row=Math.floor(index/4);
  group.position.set((col-1.5)*2.3,0,-row*1.5);
  return group;
}
function addAvatar(name){
  if(avatars.has(name)) return;
  const avatar=makeAvatar(name,avatars.size);avatars.set(name,avatar);
  avatarCountEl.textContent=`${avatars.size} PERSONAGENS`;
  document.getElementById("viewers").textContent=avatars.size;
}
let clock = new THREE.Clock();
function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
}
window.addEventListener("resize",resize);resize();
function animate(){
  requestAnimationFrame(animate);
  const t=clock.getElapsedTime();
  ring.rotation.z=t*.12;
  for(const avatar of avatars.values()){
    const p=avatar.userData.phase+t*2.3;
    avatar.rotation.y=Math.sin(t*.35+avatar.userData.phase)*.12;
    avatar.position.y=Math.abs(Math.sin(p*1.4))*.045;
    avatar.userData.arms.forEach((arm,i)=>{arm.rotation.z=Math.sin(p+(i?Math.PI:0))*.27;});
    avatar.userData.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(p+(i?Math.PI:0))*.22;});
  }
  renderer.render(scene,camera);
}
animate();
document.getElementById("resetCamera").addEventListener("click",()=>{camera.position.set(0,5.4,14);camera.lookAt(0,1,0);});
camera.lookAt(0,1,0);
document.getElementById("loading3d").textContent="PALCO PRONTO • AGUARDANDO CONEXÃO";
