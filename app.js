// ===================================================================
//  Alerta Vagas — app.js
//  App de busca de empregos por geolocalização (Firebase + Leaflet)
// ===================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc,
  updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider, OAuthProvider,
  onAuthStateChanged, signOut, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, RecaptchaVerifier, signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ---------------- Firebase ----------------
const firebaseConfig = {
  apiKey: "AIzaSyDqc9r2B1IDMyRb0hPZBWD3F43GlKZPzRQ",
  authDomain: "alertavaga-56b46.firebaseapp.com",
  projectId: "alertavaga-56b46",
  storageBucket: "alertavaga-56b46.firebasestorage.app",
  messagingSenderId: "1006667244458",
  appId: "1:1006667244458:web:4c2f35f5520843452c01d3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ---------------- Estado ----------------
const TIPOS = ["Todos", "CLT", "PJ", "Estágio", "Aprendiz", "Freelancer", "Temporário"];
const DEFAULT_POS = { lat: -19.919, lng: -43.938 }; // Belo Horizonte

const state = {
  map: null,
  circle: null,
  userMarker: null,
  markersLayer: L.layerGroup(),
  markerById: new Map(),
  allVagas: [],          // vagas reais (Firestore) + flag _real
  demoMode: false,
  userPos: { ...DEFAULT_POS },
  papelSelecionado: null,
  userRole: "visitante",
  search: "",
  tipoFiltro: "Todos",
  km: 5,
  sort: "dist",
  recaptchaVerifier: null,
  confirmationResult: null,
};

// ---------------- Utilidades ----------------
function $(id) { return document.getElementById(id); }

function distanciaEmMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distVaga(v) {
  return distanciaEmMetros(state.userPos.lat, state.userPos.lng, v.lat, v.lng);
}

function formatarDistancia(m) {
  if (m == null || isNaN(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

function salarioNumerico(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[^\d,\.]/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function mostrarAlerta(msg, autoHide = true) {
  const el = $("alert-banner");
  el.textContent = msg;
  el.classList.remove("hidden");
  if (autoHide) setTimeout(() => el.classList.add("hidden"), 6000);
}

function esconderAlerta() { $("alert-banner").classList.add("hidden"); }

// ---------------- Vagas de demonstração (fallback) ----------------
function gerarVagasDemo() {
  // Posições relativas à localização do usuário (ou padrão BH)
  const defs = [
    { cargo: "Motorista de Entrega", emp: "LogExpress Transportes", tipo: "CLT", salario: "R$ 2.300", contato: "5531991234567", descricao: "CNH B obrigatória. Entregas na região metropolitana. Vale-refeição e alimentação.", d: 0.018 },
    { cargo: "Vendedor(a) Interno", emp: "Loja Bela Vista", tipo: "CLT", salario: "R$ 1.800 + comissão", contato: "5531988765432", descricao: "Experiência em vendas. Atendimento ao público e organização da loja.", d: 0.026 },
    { cargo: "Auxiliar Administrativo", emp: "Contabilidade Real", tipo: "CLT", salario: "R$ 1.900", contato: "5531977665544", descricao: "Pacote Office, atendimento telefônico e controle de documentos.", d: 0.040 },
    { cargo: "Garçom / Garçonete", emp: "Restaurante Sabor da Terra", tipo: "Temporário", salario: "R$ 1.600 + gorjeta", contato: "5531966554433", descricao: "Trabalho em finais de semana. Experiência desejável. Uniforme gratuito.", d: 0.033 },
    { cargo: "Desenvolvedor Front-end", emp: "Tech BH", tipo: "PJ", salario: "R$ 5.000", contato: "5531955443322", descricao: "HTML, CSS, JavaScript/React. Trabalho remoto híbrido.", d: 0.072 },
    { cargo: "Atendente de Farmácia", emp: "Farmácia Vida", tipo: "CLT", salario: "R$ 1.700", contato: "5531944332211", descricao: "Escala 6x1. Ensino médio completo. Curso de farmácia é diferencial.", d: 0.050 },
    { cargo: "Aprendiz de Logística", emp: "Supermercado Economia", tipo: "Aprendiz", salario: "R$ 1.000", contato: "5531933221100", descricao: "Programa de aprendizagem para jovens de 18 a 24 anos.", d: 0.061 },
  ];
  const agora = Date.now();
  return defs.map((d, i) => {
    const ang = (i / defs.length) * Math.PI * 2;
    return {
      id: "demo-" + i,
      _real: false,
      cargo: d.cargo, emp: d.emp, tipo: d.tipo, salario: d.salario,
      contato: d.contato, descricao: d.descricao,
      lat: state.userPos.lat + d.d * Math.cos(ang),
      lng: state.userPos.lng + d.d * Math.sin(ang) / Math.cos(state.userPos.lat * Math.PI / 180),
      timestamp: agora - i * 3600000,
    };
  });
}

// ===================================================================
//  MAPA
// ===================================================================
function initMap() {
  if (state.map) return; // evita reinicialização

  state.map = L.map("map", {
    zoomControl: true,
    zoomSnap: 0.5,
    detectRetina: true,
  }).setView([state.userPos.lat, state.userPos.lng], 15);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(state.map);

  state.circle = L.circle([state.userPos.lat, state.userPos.lng], {
    radius: state.km * 1000,
    color: "#0a66c2",
    fillColor: "#0a66c2",
    fillOpacity: 0.08,
    weight: 2,
  }).addTo(state.map);

  state.userMarker = L.marker([state.userPos.lat, state.userPos.lng], {
    icon: pinIcon("user"), zIndexOffset: 1000,
  }).addTo(state.map).bindPopup("Você está aqui");

  state.markersLayer.addTo(state.map);

  // Corrige o tamanho do container (resolve mapa cinza em abas/modos desktop)
  setTimeout(() => state.map.invalidateSize(), 300);
  $("sidebar").addEventListener("transitionend", () => state.map.invalidateSize());

  // Clique no mapa = empresa anuncia vaga
  state.map.on("click", onMapClick);

  // Geolocalização
  pedirLocalizacao();

  // Inscrição em tempo real nas vagas
  subscribeVagas();
}

function pinIcon(kind) {
  return L.divIcon({
    className: "job-pin" + (kind === "user" ? " user-pin" : ""),
    html: "<span></span>",
    iconSize: [34, 42],
    iconAnchor: [17, 38],
    popupAnchor: [0, -34],
  });
}

function pedirLocalizacao(silent = false) {
  if (!navigator.geolocation) { aplicarLocalizacao(); return; }
  navigator.geolocation.getCurrentPosition(
    p => {
      state.userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
      aplicarLocalizacao();
      if (!silent) mostrarAlerta("📍 Localização atualizada.", true);
    },
    () => {
      if (!silent) mostrarAlerta("Não foi possível obter sua localização. Mostrando a região padrão (Belo Horizonte).", true);
      aplicarLocalizacao();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function aplicarLocalizacao() {
  const { lat, lng } = state.userPos;
  if (state.userMarker) state.userMarker.setLatLng([lat, lng]);
  if (state.circle) state.circle.setLatLng([lat, lng]);
  state.map.setView([lat, lng], 14);
  // Em modo demonstração, reposiciona as vagas de exemplo perto do usuário real
  if (state.demoMode) state.allVagas = gerarVagasDemo();
  atualizar();
}

function onMapClick(e) {
  if (state.userRole !== "empresa") return;
  const emp = $("v-emp").value.trim();
  const cargo = $("v-cargo").value.trim();
  if (!emp || !cargo) {
    mostrarAlerta("Preencha pelo menos Empresa e Cargo antes de tocar no mapa.", true);
    $("v-cargo").focus();
    return;
  }
  if (!auth.currentUser) { mostrarLogin(); return; }

  const nova = {
    emp, cargo,
    salario: $("v-salario").value.trim(),
    tipo: $("v-tipo").value,
    contato: $("v-contato").value.trim(),
    descricao: $("v-descricao").value.trim(),
    lat: e.latlng.lat,
    lng: e.latlng.lng,
    uid: auth.currentUser.uid,
    nomeEmpresaUsuario: auth.currentUser.displayName || "",
    timestamp: Date.now(),
  };

  addDoc(collection(db, "vagas"), nova)
    .then(() => {
      mostrarAlerta("✅ Vaga anunciada no local selecionado!", true);
      limparFormVaga();
    })
    .catch(err => {
      console.error(err);
      mostrarAlerta("Erro ao salvar vaga: " + (err?.message || "verifique as permissões do Firebase."), false);
    });
}

// ===================================================================
//  VAGAS (tempo real + filtros + render)
// ===================================================================
function subscribeVagas() {
  onSnapshot(collection(db, "vagas"), (snap) => {
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, _real: true, ...d.data() }));
    state.demoMode = false;
    if (arr.length === 0) {
      state.allVagas = gerarVagasDemo();
      state.demoMode = true;
      mostrarAlerta("Ainda não há vagas reais nesta região. Mostrando vagas de exemplo para demonstração.", true);
    } else {
      state.allVagas = arr;
      esconderAlerta();
    }
    atualizar();
  }, (err) => {
    console.error("Erro Firestore:", err);
    state.demoMode = true;
    state.allVagas = gerarVagasDemo();
    mostrarAlerta("Não foi possível acessar as vagas no momento. Mostrando exemplos. Verifique as regras de segurança do Firestore.", false);
    atualizar();
  });
}

function filtrarEOrdenar() {
  const q = state.search.trim().toLowerCase();
  const raio = state.km * 1000;
  let lista = state.allVagas.filter(v => {
    const dist = distVaga(v);
    v._dist = dist;
    if (dist > raio) return false;
    if (state.tipoFiltro !== "Todos" && (v.tipo || "Outros") !== state.tipoFiltro) return false;
    if (q) {
      const texto = `${v.cargo || ""} ${v.emp || ""} ${v.descricao || ""} ${v.tipo || ""}`.toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });

  if (state.sort === "dist") lista.sort((a, b) => a._dist - b._dist);
  else if (state.sort === "recente") lista.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  else if (state.sort === "salario") lista.sort((a, b) => salarioNumerico(b.salario) - salarioNumerico(a.salario));

  return lista;
}

function atualizar() {
  if ($("km-val")) $("km-val").innerText = state.km;
  if (state.circle) state.circle.setRadius(state.km * 1000);
  renderVagas(filtrarEOrdenar());
}

function renderVagas(vagas) {
  const list = $("jobs-list");
  state.markersLayer.clearLayers();
  state.markerById.clear();

  // Texto de resultados
  const txt = $("results-text");
  if (vagas.length === 0) {
    txt.innerHTML = `Nenhuma vaga encontrada com esses filtros.`;
  } else {
    const parte = state.demoMode ? ` (exemplos)` : "";
    txt.innerHTML = `<strong>${vagas.length}</strong> vaga${vagas.length > 1 ? "s" : ""} até ${state.km} km${parte}`;
  }

  if (vagas.length === 0) {
    list.innerHTML = `<p class="placeholder">😕 Tente aumentar a distância ou limpar a busca.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  vagas.forEach(v => {
    const card = document.createElement("div");
    card.className = "profile-card";
    card.dataset.id = v.id;

    const badges = [];
    if (v.tipo) badges.push(`<span class="badge tipo">${esc(v.tipo)}</span>`);
    if (state.demoMode) badges.push(`<span class="badge demo">exemplo</span>`);

    card.innerHTML = `
      <div class="job-card-top">
        <div style="min-width:0">
          <p class="job-title">${esc(v.cargo)}</p>
          <p class="job-company">${esc(v.emp)}</p>
        </div>
        ${v.salario ? `<span class="badge">${esc(v.salario)}</span>` : ""}
      </div>
      ${badges.length ? `<div class="job-meta">${badges.join("")}</div>` : ""}
      <p class="job-dist">📍 a ${formatarDistancia(v._dist)} de você</p>
    `;

    card.addEventListener("click", () => abrirDetalhe(v));
    frag.appendChild(card);

    // Marcador no mapa
    const marker = L.marker([v.lat, v.lng], { icon: pinIcon() }).addTo(state.markersLayer);
    marker.bindPopup(`
      <div>
        <p class="popup-title">${esc(v.cargo)}</p>
        <p class="popup-company">${esc(v.emp)}</p>
        ${v.salario ? `<p class="popup-meta">💰 ${esc(v.salario)}</p>` : ""}
        <p class="popup-meta">📍 a ${formatarDistancia(v._dist)}</p>
        <a href="#" class="popup-cta" id="popup-${v.id}">Ver detalhes</a>
      </div>
    `);
    marker.on("popupopen", () => {
      const link = document.getElementById("popup-" + v.id);
      if (link) link.addEventListener("click", (e) => { e.preventDefault(); abrirDetalhe(v); });
    });
    state.markerById.set(v.id, marker);
  });

  list.innerHTML = "";
  list.appendChild(frag);
}

// ===================================================================
//  DETALHE DA VAGA
// ===================================================================
function abrirDetalhe(v) {
  const box = $("job-detail");
  const ehDono = auth.currentUser && v.uid === auth.currentUser.uid;
  const curriculoPreenchido = !!(carregarCurriculo().nome || "").trim();
  const badges = [];
  if (v.tipo) badges.push(`<span class="badge tipo">${esc(v.tipo)}</span>`);
  if (state.demoMode) badges.push(`<span class="badge demo">exemplo</span>`);

  const contato = (v.contato || "").replace(/\D/g, "");
  const msg = encodeURIComponent(montarMensagemCandidatura(v));
  const whats = contato ? `https://wa.me/${contato}?text=${msg}` : "";

  box.innerHTML = `
    <p class="job-title" style="font-size:1.4rem">${esc(v.cargo)}</p>
    <p class="job-company" style="font-size:1.05rem">${esc(v.emp)}</p>
    <div class="detail-badges">${badges.join("")}</div>

    ${v.salario ? `<div class="detail-row"><span class="ico">💰</span><span><strong>Salário:</strong> ${esc(v.salario)}</span></div>` : ""}
    <div class="detail-row"><span class="ico">📍</span><span><strong>Distância:</strong> a ${formatarDistancia(distVaga(v))} de você</span></div>
    ${v.descricao ? `<div class="detail-row"><span class="ico">📝</span><span style="flex:1"><strong>Descrição:</strong><br>${esc(v.descricao)}</span></div>` : ""}

    <div class="detail-actions">
      ${whats ? `<button class="btn-main btn-whats" onclick="window.open('${whats}','_blank')">💬 Candidatar-se no WhatsApp${curriculoPreenchido ? " (com meu currículo)" : ""}</button>` : ""}
      ${whats && !curriculoPreenchido ? `<button class="btn-link" onclick="window.abrirCurriculo()">✍️ Preencha seu currículo para candidaturas melhores</button>` : ""}
      <button class="btn-sec" onclick="window.verNoMapa('${v.id}')">🗺️ Ver no mapa</button>
      ${ehDono && v._real ? `<button class="btn-sec" style="color:var(--danger);border-color:var(--danger)" onclick="window.excluirVaga('${v.id}')">🗑️ Excluir minha vaga</button>` : ""}
      ${!whats && !ehDono ? `<p class="muted">Esta vaga não informou contato.</p>` : ""}
    </div>
  `;
  $("job-modal").classList.add("show");
}

// ===================================================================
//  AUTH
// ===================================================================
onAuthStateChanged(auth, async (user) => {
  // Mostra/esconde botões
  $("btn-entrar").classList.toggle("hidden", !!user);
  $("btn-sair").classList.toggle("hidden", !user);

  if (!user) {
    state.userRole = "visitante";
    $("user-info").classList.add("hidden");
    aplicarPainelPorPapel();
    return;
  }

  $("user-info").classList.remove("hidden");
  const ref = doc(db, "usuarios", user.uid);
  const d = await getDoc(ref);

  state.userRole = (d.exists() && d.data().tipo) ? d.data().tipo : (state.papelSelecionado || "candidato");

  if (!d.exists()) {
    await setDoc(ref, {
      tipo: state.userRole,
      cargoPretendido: "",
      nome: user.displayName || (user.email ? user.email.split("@")[0] : "Usuário"),
    });
  } else if (!d.data().tipo && state.papelSelecionado) {
    await updateDoc(ref, { tipo: state.papelSelecionado });
    state.userRole = state.papelSelecionado;
  }

  $("u-name").innerText = `Olá, ${(user.displayName || (user.email ? user.email.split("@")[0] : "")) || "usuário"}!`;
  const badge = $("u-badge");
  badge.className = "badge role";
  badge.innerText = state.userRole === "empresa" ? "🏢 Empresa" : "🧑 Candidato";

  // Carrega cargo pretendido salvo para preencher a busca
  // (dá prioridade ao cargo do currículo salvo no aparelho)
  const cargoSalvo = carregarCurriculo().cargo || (d.exists() ? d.data().cargoPretendido : "");
  if (cargoSalvo) {
    state.search = cargoSalvo;
    $("search-input").value = state.search;
  }

  aplicarPainelPorPapel();
  atualizar();
});

function aplicarPainelPorPapel() {
  const empresa = state.userRole === "empresa";
  $("panel-empresa").classList.toggle("hidden", !empresa);
}

// ---------------- Handlers expostos (onclick no HTML) ----------------
window.mostrarLogin = () => {
  $("login-modal").classList.add("show");
  $("phone-flow").classList.add("hidden");
  voltarParaLogin();
  // Pré-seleciona "Candidato" (perfil mais comum) para agilizar o acesso
  window.prepararPapel("candidato");
};

window.fecharLogin = () => {
  $("login-modal").classList.remove("show");
  state.papelSelecionado = null;
};

window.prepararPapel = (p) => {
  state.papelSelecionado = p;
  $("auth-fields").classList.remove("disabled");
  marcarPapelSelecionado(p);
};

function marcarPapelSelecionado(p) {
  $("sel-c").classList.toggle("active", p === "candidato");
  $("sel-e").classList.toggle("active", p === "empresa");
}

window.authEmail = async () => {
  if (!state.papelSelecionado) { mostrarAlerta("Selecione um perfil primeiro.", true); return; }
  const email = $("auth-email").value.trim();
  const pass = $("auth-pass").value;
  if (!email || !pass) { mostrarAlerta("Preencha e-mail e senha.", true); return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    try { await createUserWithEmailAndPassword(auth, email, pass); }
    catch (err) { mostrarAlerta("Erro: " + (err?.message || "não foi possível entrar."), true); return; }
  }
  window.fecharLogin();
};

window.loginGoogle = () => {
  if (!state.papelSelecionado) { mostrarAlerta("Selecione um perfil primeiro.", true); return; }
  signInWithPopup(auth, googleProvider).then(window.fecharLogin)
    .catch(e => mostrarAlerta("Erro Google: " + (e?.message || ""), true));
};

window.loginApple = () => {
  if (!state.papelSelecionado) { mostrarAlerta("Selecione um perfil primeiro.", true); return; }
  signInWithPopup(auth, new OAuthProvider("apple.com")).then(window.fecharLogin)
    .catch(e => mostrarAlerta("Erro Apple: " + (e?.message || ""), true));
};

window.logout = () => signOut(auth);

window.trocarPerfil = async () => {
  if (!auth.currentUser) return;
  const nova = state.userRole === "empresa" ? "candidato" : "empresa";
  await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { tipo: nova });
  state.userRole = nova;
  aplicarPainelPorPapel();
  const badge = $("u-badge");
  badge.innerText = nova === "empresa" ? "🏢 Empresa" : "🧑 Candidato";
  mostrarAlerta(nova === "empresa" ? "🏢 Perfil de empresa ativo. Toque no mapa para anunciar." : "🧑 Perfil de candidato ativo.", true);
};

// ---- Telefone (SMS) ----
window.loginTelefone = () => {
  if (!state.papelSelecionado) { mostrarAlerta("Selecione um perfil primeiro.", true); return; }
  $("auth-fields").classList.add("hidden");
  $("phone-flow").classList.remove("hidden");
  $("code-step").classList.add("hidden");
  $("phone-number").value = "";

  try {
    state.recaptchaVerifier = new RecaptchaVerifier(auth, "btn-send-code", { size: "invisible" });
    state.recaptchaVerifier.render();
  } catch (e) { console.warn("recaptcha:", e); }
};

window.enviarCodigoTelefone = async () => {
  const tel = $("phone-number").value.trim();
  if (!/^\+?\d{10,15}$/.test(tel.replace(/\s/g, ""))) {
    mostrarAlerta("Digite um telefone válido com DDI (ex: +55 31 99999-9999).", true);
    return;
  }
  try {
    const telefone = tel.startsWith("+") ? tel : "+" + tel.replace(/\D/g, "");
    state.confirmationResult = await signInWithPhoneNumber(auth, telefone, state.recaptchaVerifier);
    $("code-step").classList.remove("hidden");
    mostrarAlerta("Código enviado por SMS.", true);
  } catch (e) {
    console.error(e);
    mostrarAlerta("Não foi possível enviar o código: " + (e?.message || "verifique se a autenticação por telefone está ativa no Firebase.") , false);
    if (state.recaptchaVerifier) { try { state.recaptchaVerifier.reset(); } catch (_) {} }
  }
};

window.confirmarCodigoTelefone = async () => {
  const code = $("phone-code").value.trim();
  if (!code) { mostrarAlerta("Digite o código recebido.", true); return; }
  try {
    await state.confirmationResult.confirm(code);
    window.fecharLogin();
  } catch (e) {
    mostrarAlerta("Código inválido ou expirado: " + (e?.message || ""), true);
  }
};

window.voltarParaLogin = () => {
  $("phone-flow").classList.add("hidden");
  $("auth-fields").classList.remove("hidden");
  if (state.recaptchaVerifier) { try { state.recaptchaVerifier.clear(); } catch (_) {} state.recaptchaVerifier = null; }
};

// ---- Detalhe ----
window.fecharDetalhe = () => $("job-modal").classList.remove("show");

window.verNoMapa = (id) => {
  window.fecharDetalhe();
  // Recolhe totalmente o painel para revelar o mapa no mobile
  const sb = $("sidebar");
  sb.classList.remove("half", "open");
  sb.dataset.state = "minimized";
  const m = state.markerById.get(id);
  if (m && state.map) {
    state.map.panTo(m.getLatLng());
    setTimeout(() => m.openPopup(), 350);
  }
};

window.excluirVaga = async (id) => {
  if (!confirm("Excluir esta vaga?")) return;
  try {
    await deleteDoc(doc(db, "vagas", id));
    window.fecharDetalhe();
    mostrarAlerta("Vaga excluída.", true);
  } catch (e) {
    mostrarAlerta("Erro ao excluir: " + (e?.message || "sem permissão."), false);
  }
};

window.limparFormVaga = () => {
  ["v-emp", "v-cargo", "v-salario", "v-contato", "v-descricao"].forEach(i => $(i).value = "");
  $("v-tipo").value = "";
};

// ===================================================================
//  CURRÍCULO DO CANDIDATO (localStorage + sincronização opcional)
// ===================================================================
const CURR_KEY = "alertavaga_curriculo";
const CURR_FIELDS = ["c-nome", "c-cargo", "c-tel", "c-cidade", "c-esc", "c-exp"];

function carregarCurriculo() {
  try { return JSON.parse(localStorage.getItem(CURR_KEY)) || {}; }
  catch { return {}; }
}
function salvarCurriculoStorage(c) {
  localStorage.setItem(CURR_KEY, JSON.stringify(c));
}

function atualizarStatusCurriculo() {
  const c = carregarCurriculo();
  const badge = $("curriculo-status");
  if (!badge) return;
  const ok = !!(c.nome && c.nome.trim());
  badge.textContent = ok ? "✓ preenchido" : "preencher";
  badge.classList.toggle("completo", ok);
}

function montarMensagemCandidatura(vaga) {
  const c = carregarCurriculo();
  const linhas = [`Olá! Vim pelo Alerta Vagas e tenho interesse na vaga de ${vaga.cargo}.`];
  if (c.nome) linhas.push(`Nome: ${c.nome}`);
  if (c.cargo) linhas.push(`Área: ${c.cargo}`);
  if (c.esc) linhas.push(`Escolaridade: ${c.esc}`);
  if (c.cidade) linhas.push(`Região: ${c.cidade}`);
  if (c.tel) linhas.push(`Meu contato: ${c.tel}`);
  if (c.exp) linhas.push(`Resumo: ${String(c.exp).slice(0, 300)}`);
  return linhas.join("\n");
}

window.abrirCurriculo = () => {
  const c = carregarCurriculo();
  CURR_FIELDS.forEach(id => { $(id).value = c[id.replace("c-", "")] || ""; });
  $("curriculo-modal").classList.add("show");
};

window.fecharCurriculo = () => $("curriculo-modal").classList.remove("show");

window.salvarCurriculo = async () => {
  const nome = $("c-nome").value.trim();
  if (!nome) { mostrarAlerta("Preencha pelo menos o seu nome.", true); $("c-nome").focus(); return; }
  const c = {
    nome,
    cargo: $("c-cargo").value.trim(),
    tel: $("c-tel").value.trim(),
    cidade: $("c-cidade").value.trim(),
    esc: $("c-esc").value,
    exp: $("c-exp").value.trim(),
    atualizado: Date.now(),
  };
  salvarCurriculoStorage(c);
  atualizarStatusCurriculo();

  // Usa o cargo do currículo como busca padrão
  if (c.cargo) {
    state.search = c.cargo;
    $("search-input").value = c.cargo;
    atualizar();
  }

  // Sincroniza com a conta (melhor esforço) se logado
  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
        cargoPretendido: c.cargo,
        nome: c.nome,
        curriculo: c,
      });
    } catch (e) { /* sem problema: o currículo fica salvo no aparelho */ }
  }

  window.fecharCurriculo();
  mostrarAlerta("✅ Currículo salvo! Ele já vai nas suas candidaturas.", true);
};

window.limparCurriculo = () => {
  if (!confirm("Apagar o currículo salvo neste aparelho?")) return;
  localStorage.removeItem(CURR_KEY);
  CURR_FIELDS.forEach(id => $(id).value = "");
  atualizarStatusCurriculo();
  mostrarAlerta("Currículo apagado.", true);
};


// ===================================================================
//  CHIPS DE FILTRO + EVENTOS DE UI
// ===================================================================
function montarChips() {
  const wrap = $("tipo-chips");
  wrap.innerHTML = "";
  TIPOS.forEach(t => {
    const b = document.createElement("button");
    b.className = "chip" + (t === state.tipoFiltro ? " active" : "");
    b.textContent = t;
    b.onclick = () => {
      state.tipoFiltro = t;
      wrap.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      b.classList.add("active");
      atualizar();
    };
    wrap.appendChild(b);
  });
}

function bindUI() {
  // Toggle da sidebar (mobile) — alterna entre meio / aberto / minimizado
  const SIDEBAR_STATES = ["half", "open", "minimized"];
  $("sidebar-toggle").addEventListener("click", () => {
    const el = $("sidebar");
    const atual = el.dataset.state || "half";
    const prox = SIDEBAR_STATES[(SIDEBAR_STATES.indexOf(atual) + 1) % SIDEBAR_STATES.length];
    el.classList.remove("half", "open");
    el.dataset.state = prox;
    if (prox === "half" || prox === "open") el.classList.add(prox);
  });

  // Raio
  $("range-km").addEventListener("input", (e) => {
    state.km = parseInt(e.target.value);
    atualizar();
  });

  // Busca
  $("search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    atualizar();
  });
  // Salva cargo pretendido ao sair do campo (candidato logado)
  $("search-input").addEventListener("change", async () => {
    if (auth.currentUser && state.userRole === "candidato") {
      try { await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { cargoPretendido: $("search-input").value }); }
      catch (e) { /* ignora */ }
    }
  });

  // Ordenação
  $("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    atualizar();
  });

  // Localizar
  $("btn-localizar").addEventListener("click", () => pedirLocalizacao());

  // Fecha modais ao clicar no fundo
  $("login-modal").addEventListener("click", (e) => { if (e.target.id === "login-modal") window.fecharLogin(); });
  $("job-modal").addEventListener("click", (e) => { if (e.target.id === "job-modal") window.fecharDetalhe(); });
  $("curriculo-modal").addEventListener("click", (e) => { if (e.target.id === "curriculo-modal") window.fecharCurriculo(); });

  // ESC fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { window.fecharLogin(); window.fecharDetalhe(); window.fecharCurriculo(); }
  });
}

// ===================================================================
//  BOOT
// ===================================================================
function boot() {
  montarChips();
  bindUI();
  initMap();                 // mapa já na carga (independente do auth)
  atualizarStatusCurriculo();
  // Pré-preenche a busca com o cargo do currículo salvo
  const cargoSalvo = carregarCurriculo().cargo;
  if (cargoSalvo) {
    state.search = cargoSalvo;
    $("search-input").value = cargoSalvo;
  }
  // No mobile, abre o painel até a posição "meio" para mostrar vagas/filtros
  const sb = $("sidebar");
  sb.dataset.state = "half";
  sb.classList.add("half");
}

// Service worker (PWA / offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => console.warn("SW não registrado:", err));
  });
}

document.addEventListener("DOMContentLoaded", boot);
