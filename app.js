/*  Flora Friulana – interfaccia robusta
    Attesi:
      - keys_by_family.json  (oggetto { "Fam": {root,nodes,...} } OPPURE array [{family,root,nodes}])
      - species.json         (array specie)
*/
const FILE_KEYS = "keys_by_family.json";
const FILE_SPECIES = "species.json";

const dom = {
  select: document.getElementById("familySelect"),
  reset: document.getElementById("resetBtn"),
  status: document.getElementById("status"),
  famWrap: document.getElementById("familyTitleWrap"),
  famTitle: document.getElementById("familyTitle"),
  breadcrumb: document.getElementById("breadcrumb"),
  key: document.getElementById("keyContainer"),
  species: document.getElementById("speciesContainer"),
};

let KEYS_BY_FAMILY = {};     // { "Famiglia": { family, root, nodes } }
let SPECIES = [];
let current = { family:null, key:null, map:new Map(), trail:[] };

init();

async function init(){
  try{
    dom.status.textContent = "Carico dati…";

    const [keysRaw, species] = await Promise.all([
      fetch(FILE_KEYS).then(r => { if(!r.ok) throw new Error(`Impossibile leggere ${FILE_KEYS}`); return r.json(); }),
      fetch(FILE_SPECIES).then(r => { if(!r.ok) throw new Error(`Impossibile leggere ${FILE_SPECIES}`); return r.json(); })
    ]);
    SPECIES = Array.isArray(species) ? species : [];

    // Normalizza lo schema delle chiavi (supporta oggetto o array)
    KEYS_BY_FAMILY = normalizeFamilyKeys(keysRaw);

    // Popola tendina
    const families = Object.keys(KEYS_BY_FAMILY).sort((a,b)=>a.localeCompare(b,'it'));
    dom.select.innerHTML = '<option value="">— scegli una famiglia —</option>';
    for(const fam of families){
      const opt = document.createElement("option");
      opt.value = fam; opt.textContent = fam;
      dom.select.appendChild(opt);
    }

    dom.select.addEventListener("change", onFamilyChange);
    dom.reset.addEventListener("click", resetAll);

    dom.status.textContent = "";
  }catch(err){
    errorStatus(err.message);
    console.error(err);
  }
}

function clearFamilyView(){
  const dom = {
    famTitle: document.getElementById("familyTitle"),
    famWrap: document.getElementById("familyTitleWrap"),
    breadcrumb: document.getElementById("breadcrumb"),
    key: document.getElementById("keyContainer"),
    species: document.getElementById("speciesContainer"),
    status: document.getElementById("status"),
  };
  dom.famTitle.textContent = "";
  dom.famWrap.classList.add("hidden");
  dom.breadcrumb.classList.add("hidden");
  dom.key.innerHTML = "";
  dom.species.innerHTML = "";
  dom.status.textContent = "";
}

function normalizeFamilyKeys(input){
  // caso 1: oggetto già nel formato atteso
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input;
  }
  // caso 2: array di blocchi {family, root, nodes} o {name, key:{root,nodes}}
  if (Array.isArray(input)) {
    const out = {};
    for (const item of input) {
      if (!item) continue;
      // supporta diverse varianti
      const family = item.family || item.name;
      const keyObj = item.key ? item.key : item;
      if (!family || !keyObj.root || !Array.isArray(keyObj.nodes)) {
        console.warn("Voce famiglia non valida:", item);
        continue;
      }
      out[family] = { family, root:keyObj.root, nodes:keyObj.nodes };
    }
    return out;
  }
  throw new Error("Formato non riconosciuto per keys_by_family.json");
}

function resetAll(){
  dom.select.value = "";
  clearFamilyView();
  current = { family:null, key:null, map:new Map(), trail:[] };
  updateHash();
}

function onFamilyChange(){
  const fam = dom.select.value;
  if(!fam){ resetAll(); return; }
  loadFamily(fam);
}

function loadFamily(familyName){
  clearFamilyView();
  const keyObj = KEYS_BY_FAMILY[familyName];
  if(!keyObj){
    return errorStatus(`Chiave mancante per “${escapeHtml(familyName)}”.`);
  }
  // Validazione struttura
  if(!keyObj.root || !Array.isArray(keyObj.nodes)){
    return errorStatus(`Struttura non valida per “${escapeHtml(familyName)}” (manca root o nodes).`);
  }
  const map = new Map(keyObj.nodes.map(n => [n.id, n]));
  if(!map.has(keyObj.root)){
    console.error("Nodi disponibili:", keyObj.nodes);
    return errorStatus(`Root "${escapeHtml(keyObj.root)}" non trovato nei nodes di “${escapeHtml(familyName)}”.`);
  }

  current.family = familyName;
  current.key = keyObj;
  current.map = map;
  current.trail = [];

  dom.famTitle.textContent = familyName;
  dom.famWrap.classList.remove("hidden");
  dom.breadcrumb.classList.remove("hidden");

  renderNode(keyObj.root);
  updateBreadcrumb();
  updateHash();
}

function renderNode(nodeId){
  const node = current.map.get(nodeId);
  if(!node){
    return errorStatus(`Nodo non trovato: ${escapeHtml(nodeId)}`);
  }
  pushToTrail({ nodeId });

  dom.key.innerHTML = "";
  dom.species.innerHTML = "";

  const card = document.createElement("article");
  card.className = "node";

  const prompt = document.createElement("div");
  prompt.className = "prompt";
  prompt.textContent = node.prompt || "";

  const opts = document.createElement("div");
  opts.className = "options";

  if (!node.options || !node.options.length) {
    const p = document.createElement("p");
    p.textContent = "Nessuna opzione in questo nodo.";
    opts.appendChild(p);
  } else {
    for(const opt of node.options){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = escapeHtml(opt.label || "—");
      btn.addEventListener("click", () => handleOption(opt));
      opts.appendChild(btn);
    }
  }

  card.append(prompt, opts);
  dom.key.appendChild(card);
  dom.status.textContent = "";
}

function handleOption(opt){
  if(current.trail.length){
    current.trail[current.trail.length-1].chosen = opt.label || "";
  }
  updateBreadcrumb();

  if(opt.next){
    if(!current.map.has(opt.next)){
      return errorStatus(`Nodo successivo non trovato: ${escapeHtml(opt.next)}.`);
    }
    renderNode(opt.next);
    updateHash();
    return;
  }
  if(opt.speciesId){
    showSpecies(opt.speciesId);
    updateHash({ speciesId: opt.speciesId });
    return;
  }
  errorStatus("Opzione senza `next` né `speciesId`.");
}

function showSpecies(speciesId){
  dom.species.innerHTML = "";
  const sp = SPECIES.find(s => s.id === speciesId);
  if(!sp){
    return errorStatus(`Specie non trovata: ${escapeHtml(speciesId)}.`);
  }
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("div");
  title.innerHTML = `<span class="sciname">${escapeHtml(sp.scientificName || "")}</span>` +
                    (sp.vernacularName ? `<span class="vernacular">— ${escapeHtml(sp.vernacularName)}</span>` : "");

  const desc = document.createElement("div");
  desc.className = "description";
  desc.textContent = sp.description || "";

  const tags = document.createElement("div");
  tags.className = "tags";
  tags.textContent = sp.family ? `Famiglia: ${sp.family}` : "";

  card.append(title, desc, tags);
  dom.species.appendChild(card);
  dom.status.textContent = "";
}

function clearFamilyView(){
  dom.famTitle.textContent = "";
  dom.famWrap.classList.add("hidden");
  dom.breadcrumb.classList.add("hidden");
  dom.key.innerHTML = "";
  dom.species.innerHTML = "";
  dom.status.textContent = "";
  current.trail = [];
}

function updateBreadcrumb(){
  dom.breadcrumb.innerHTML = "";
  if(!current.family){ dom.breadcrumb.classList.add("hidden"); return; }

  const famBtn = document.createElement("button");
  famBtn.textContent = current.family;
  famBtn.addEventListener("click", ()=> loadFamily(current.family));
  dom.breadcrumb.appendChild(famBtn);

  current.trail.forEach((step, idx) => {
    const btn = document.createElement("button");
    const node = current.map.get(step.nodeId);
    const suffix = step.chosen ? ` — ${step.chosen}` : "";
    btn.textContent = (node?.prompt ?? `Nodo ${step.nodeId}`) + suffix;
    btn.addEventListener("click", ()=>{
      current.trail = current.trail.slice(0, idx);
      renderNode(step.nodeId);
      updateHash();
    });
    dom.breadcrumb.appendChild(btn);
  });
}

function pushToTrail(step){
  if(current.trail.length && current.trail[current.trail.length-1].nodeId === step.nodeId) return;
  current.trail.push(step);
}

function updateHash(extra={}){
  const params = new URLSearchParams();
  if(current.family) params.set("fam", current.family);
  const last = current.trail.at(-1);
  if(last?.nodeId) params.set("node", last.nodeId);
  if(extra.speciesId) params.set("sp", extra.speciesId);
  location.hash = params.toString();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[s]));
}

function errorStatus(msg){
  dom.status.innerHTML = `<span style="color:#ff6b6b">${msg}</span>`;
}
