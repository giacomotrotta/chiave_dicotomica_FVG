/*  Flora Friulana – interfaccia
    Attesi nella root del repo:
      - keys_by_family.json  (schema: { "<Famiglia>": { family, root, nodes: [...] }, ... })
      - species.json         (schema: [ {id, scientificName, vernacularName, family, description}, ... ])
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

let KEYS_BY_FAMILY = {};
let SPECIES = [];
let current = {
  family: null,
  key: null,       // {family, root, nodes}
  map: new Map(),  // nodeId -> node
  trail: [],       // breadcrumbs: {nodeId, chosenLabel?}
};

init();

async function init(){
  try{
    dom.status.textContent = "Carico dati…";
    const [keys, species] = await Promise.all([
      fetch(FILE_KEYS).then(r => {
        if(!r.ok) throw new Error(`Impossibile leggere ${FILE_KEYS}`);
        return r.json();
      }),
      fetch(FILE_SPECIES).then(r => {
        if(!r.ok) throw new Error(`Impossibile leggere ${FILE_SPECIES}`);
        return r.json();
      })
    ]);
    KEYS_BY_FAMILY = keys || {};
    SPECIES = Array.isArray(species) ? species : [];

    // Popola tendina famiglie
    const families = Object.keys(KEYS_BY_FAMILY).sort((a,b)=>a.localeCompare(b,'it'));
    for(const fam of families){
      const opt = document.createElement("option");
      opt.value = fam; opt.textContent = fam;
      dom.select.appendChild(opt);
    }

    // Eventi UI
    dom.select.addEventListener("change", onFamilyChange);
    dom.reset.addEventListener("click", resetAll);

    // Ripristina stato da URL hash (opzionale)
    restoreFromHash();
    dom.status.textContent = "";
  }catch(err){
    dom.status.innerHTML = `<span style="color:var(--err)">${err.message}</span>`;
    console.error(err);
  }
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
  if(!keyObj || !keyObj.nodes || !keyObj.root){
    dom.status.innerHTML = `<span style="color:var(--err)">Chiave mancante o incompleta per “${escapeHtml(familyName)}”.</span>`;
    return;
  }

  current.family = familyName;
  current.key = keyObj;
  current.map = new Map(keyObj.nodes.map(n => [n.id, n]));
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
    dom.status.innerHTML = `<span style="color:var(--err)">Nodo non trovato: ${escapeHtml(nodeId)}</span>`;
    return;
  }
  // aggiungi al trail (visualizzazione “posizione attuale”)
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

  for(const opt of node.options || []){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = escapeHtml(opt.label || "—");
    btn.addEventListener("click", () => handleOption(opt));
    opts.appendChild(btn);
  }

  card.append(prompt, opts);
  dom.key.appendChild(card);
}

function handleOption(opt){
  // aggiorna trail con label scelta sull’ultimo step
  if(current.trail.length){
    current.trail[current.trail.length-1].chosen = opt.label || "";
  }
  updateBreadcrumb();

  if(opt.next){
    renderNode(opt.next);
    updateHash();
    return;
  }
  if(opt.speciesId){
    showSpecies(opt.speciesId);
    updateHash({ speciesId: opt.speciesId });
    return;
  }
  dom.status.innerHTML = `<span style="color:var(--warn)">Opzione senza next/speciesId.</span>`;
}

function showSpecies(speciesId){
  dom.species.innerHTML = "";
  const sp = SPECIES.find(s => s.id === speciesId);
  if(!sp){
    dom.status.innerHTML = `<span style="color:var(--err)">Specie non trovata: ${escapeHtml(speciesId)}</span>`;
    return;
  }
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("div");
  title.innerHTML = `<span class="sciname">${escapeHtml(sp.scientificName || "")}</span>` +
                    (sp.vernacularName ? `<span class="vernacular">— ${escapeHtml(sp.vernacularName)}</span>` : "");

  const desc = document.createElement("div");
  desc.className = "description";
  // Testo identico al Word (campo description)
  desc.textContent = sp.description || "";

  const tags = document.createElement("div");
  tags.className = "tags";
  tags.textContent = sp.family ? `Famiglia: ${sp.family}` : "";

  card.append(title, desc, tags);
  dom.species.appendChild(card);
}

function updateBreadcrumb(){
  dom.breadcrumb.innerHTML = "";
  if(!current.family){ dom.breadcrumb.classList.add("hidden"); return; }

  // Famiglia (cliccabile per tornare all’inizio della chiave)
  const famBtn = document.createElement("button");
  famBtn.textContent = current.family;
  famBtn.addEventListener("click", ()=> loadFamily(current.family));
  dom.breadcrumb.appendChild(famBtn);

  // Ogni nodo selezionato
  current.trail.forEach((step, idx) => {
    const btn = document.createElement("button");
    const node = current.map.get(step.nodeId);
    const suffix = step.chosen ? ` — ${step.chosen}` : "";
    btn.textContent = (node?.prompt ?? `Nodo ${step.nodeId}`) + suffix;
    btn.addEventListener("click", ()=>{
      // taglia trail e torna a quel nodo
      current.trail = current.trail.slice(0, idx);
      renderNode(step.nodeId);
      updateHash();
    });
    dom.breadcrumb.appendChild(btn);
  });
}

function pushToTrail(step){
  // evita duplicati consecutivi dello stesso nodo
  if(current.trail.length && current.trail[current.trail.length-1].nodeId === step.nodeId) return;
  current.trail.push(step);
  updateBreadcrumb();
}

// ————————————————————————
// Stato in URL (permalink minimal)
// ————————————————————————
function updateHash(extra={}){
  const params = new URLSearchParams();
  if(current.family) params.set("fam", current.family);
  const last = current.trail.at(-1);
  if(last?.nodeId) params.set("node", last.nodeId);
  if(extra.speciesId) params.set("sp", extra.speciesId);
  location.hash = params.toString();
}

function restoreFromHash(){
  const hash = location.hash.replace(/^#/, "");
  if(!hash) return;
  const p = new URLSearchParams(hash);
  const fam = p.get("fam");
  const node = p.get("node");
  const sp = p.get("sp");

  if(fam && KEYS_BY_FAMILY[fam]){
    dom.select.value = fam;
    loadFamily(fam);
    if(node && current.map.has(node)){
      // ricostruzione “soft”: vai al nodo richiesto
      current.trail = []; // reset trail per coerenza
      renderNode(node);
    }
    if(sp){
      showSpecies(sp);
    }
  }
}

// ————————————————————————
// Utils
// ————————————————————————
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  })[s]);
}
