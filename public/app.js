// app.js — Club Quran ENSIAS quiz frontend logic

const state = {
  playerId: null,
  name: "",
  credential: null, // Google ID token (JWT) when auth enabled
  googleEnabled: false,
  questions: [],
  current: 0,
  score: 0,
  correct: 0,
  timePerQuestion: 30,
  timer: null,
  questionStart: 0,
  answered: false,
};

const $ = (id) => document.getElementById(id);
const LETTERS = ["أ", "ب", "ج", "د", "هـ"];

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0, 0);
}

async function api(path, method = "GET", body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

// ===== Startup: load config and set up Google sign-in =====
(async function initWelcome() {
  let cfg = { googleEnabled: false, googleClientId: "" };
  try { cfg = await api("/api/config"); } catch (e) {}
  state.googleEnabled = !!cfg.googleEnabled;

  if (state.googleEnabled && cfg.googleClientId) {
    $("googleStep").classList.remove("hidden");
    // Wait for the Google script to be ready, then render the button
    const waitGoogle = setInterval(() => {
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(waitGoogle);
        google.accounts.id.initialize({
          client_id: cfg.googleClientId,
          callback: onGoogleCredential,
        });
        google.accounts.id.renderButton($("googleBtn"), {
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          text: "signin_with",
          locale: "ar",
        });
      }
    }, 150);
  } else {
    // No Google auth: show the name step directly
    $("nameStep").classList.remove("hidden");
  }
})();

function onGoogleCredential(resp) {
  state.credential = resp.credential;
  // Decode the name/email from the token payload (display only)
  try {
    const payload = JSON.parse(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    $("googleUserLine").textContent = "✓ تم تسجيل الدخول: " + (payload.email || payload.name || "");
    if (payload.name && !$("playerName").value) $("playerName").value = payload.name.slice(0, 40);
  } catch (e) {}
  // Reveal the username step
  $("nameStep").classList.remove("hidden");
  $("playerName").focus();
}

// ===== Welcome / register =====
$("startBtn").addEventListener("click", startQuiz);
$("playerName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") startQuiz();
});

async function startQuiz() {
  const name = $("playerName").value.trim();
  if (!name) {
    $("welcomeError").textContent = "من فضلك اختر اسمك أولاً";
    return;
  }
  if (state.googleEnabled && !state.credential) {
    $("welcomeError").textContent = "يجب تسجيل الدخول عبر Google أولاً";
    return;
  }
  $("startBtn").disabled = true;
  $("welcomeError").textContent = "";
  try {
    const reg = await api("/api/register", "POST", { name, credential: state.credential });
    if (reg.error) throw new Error(reg.error);
    state.playerId = reg.playerId;
    state.name = reg.name;
    state.timePerQuestion = reg.timePerQuestion;

    const qd = await api("/api/questions");
    state.questions = qd.questions;
    state.current = 0;
    state.score = 0;
    state.correct = 0;

    $("qTotal").textContent = state.questions.length;
    showScreen("screen-quiz");
    renderQuestion();
  } catch (err) {
    $("welcomeError").textContent = (err && err.message) ? err.message : "حدث خطأ، حاول مرة أخرى";
    $("startBtn").disabled = false;
  }
}

// ===== Render a question =====
function renderQuestion() {
  state.answered = false;
  const q = state.questions[state.current];

  $("qIndex").textContent = state.current + 1;
  $("qCategory").textContent = q.category;
  $("qText").textContent = q.text;
  $("progressFill").style.width = ((state.current) / state.questions.length) * 100 + "%";

  const optionsArea = $("optionsArea");
  const openArea = $("openArea");
  optionsArea.innerHTML = "";

  if (q.type === "mcq") {
    openArea.classList.add("hidden");
    optionsArea.classList.remove("hidden");
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.innerHTML = `<span class="option-letter">${LETTERS[i]}</span><span>${escapeHtml(opt)}</span>`;
      btn.addEventListener("click", () => submitAnswer(i, btn));
      optionsArea.appendChild(btn);
    });
  } else {
    optionsArea.classList.add("hidden");
    openArea.classList.remove("hidden");
    $("openInput").value = "";
    $("openInput").disabled = false;
    $("submitOpenBtn").disabled = false;
    setTimeout(() => $("openInput").focus(), 100);
  }

  startTimer();
}

$("submitOpenBtn").addEventListener("click", () => {
  if (state.answered) return;
  submitAnswer($("openInput").value.trim());
});
$("openInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !state.answered) submitAnswer($("openInput").value.trim());
});

// ===== Timer =====
function startTimer() {
  clearInterval(state.timer);
  state.questionStart = Date.now();
  const total = state.timePerQuestion;
  let remaining = total;
  const bar = $("timerBar");
  const txt = $("timerText");
  bar.classList.remove("warning");
  bar.style.width = "100%";
  txt.textContent = remaining;

  state.timer = setInterval(() => {
    remaining -= 1;
    txt.textContent = Math.max(0, remaining);
    bar.style.width = Math.max(0, (remaining / total) * 100) + "%";
    if (remaining <= 10) bar.classList.add("warning");
    if (remaining <= 0) {
      clearInterval(state.timer);
      if (!state.answered) submitAnswer(null); // time out
    }
  }, 1000);
}

// ===== Submit answer (no feedback — go straight to next question) =====
async function submitAnswer(answer, clickedBtn) {
  if (state.answered) return;
  state.answered = true;
  clearInterval(state.timer);
  const timeMs = Date.now() - state.questionStart;
  const q = state.questions[state.current];

  // Lock the UI briefly
  if (q.type === "mcq") {
    document.querySelectorAll(".option-btn").forEach((b) => (b.disabled = true));
    if (clickedBtn) clickedBtn.classList.add("selected");
  } else {
    $("openInput").disabled = true;
    $("submitOpenBtn").disabled = true;
  }

  // Record the answer silently (server stores it; we never reveal correctness)
  try {
    await api("/api/answer", "POST", {
      playerId: state.playerId,
      questionId: q.id,
      answer: answer == null ? "" : answer,
      timeMs,
    });
  } catch (e) { /* ignore, keep going */ }

  // Advance immediately
  if (isLast()) {
    finishQuiz();
  } else {
    state.current += 1;
    renderQuestion();
  }
}

function isLast() {
  return state.current >= state.questions.length - 1;
}

async function nextQuestion() {
  if (isLast()) {
    await finishQuiz();
    return;
  }
  state.current += 1;
  renderQuestion();
}

// ===== Finish =====
async function finishQuiz() {
  $("progressFill").style.width = "100%";
  try {
    await api("/api/finish", "POST", { playerId: state.playerId });
  } catch (e) { /* ignore */ }
  const label = state.name ? ("المتسابق: " + state.name) : "";
  $("resultName").textContent = label;
  showScreen("screen-results");
}

// ===== Util =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
