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
  $("scoreBadge").textContent = state.score;
  $("qCategory").textContent = q.category;
  $("qText").textContent = q.text;
  $("progressFill").style.width = ((state.current) / state.questions.length) * 100 + "%";

  const optionsArea = $("optionsArea");
  const openArea = $("openArea");
  const feedback = $("feedback");
  feedback.className = "feedback hidden";
  feedback.innerHTML = "";
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

// ===== Submit answer =====
async function submitAnswer(answer, clickedBtn) {
  if (state.answered) return;
  state.answered = true;
  clearInterval(state.timer);
  const timeMs = Date.now() - state.questionStart;
  const q = state.questions[state.current];

  // Lock the UI
  if (q.type === "mcq") {
    document.querySelectorAll(".option-btn").forEach((b) => (b.disabled = true));
  } else {
    $("openInput").disabled = true;
    $("submitOpenBtn").disabled = true;
  }

  const resp = await api("/api/answer", "POST", {
    playerId: state.playerId,
    questionId: q.id,
    answer: answer == null ? "" : answer,
    timeMs,
  });

  if (resp.isCorrect) {
    state.score += resp.points;
    state.correct += 1;
    $("scoreBadge").textContent = state.score;
  }

  // Visual marking for MCQ
  if (q.type === "mcq") {
    const btns = document.querySelectorAll(".option-btn");
    const correctIdx = q.options.indexOf(resp.correctAnswer);
    btns.forEach((b, i) => {
      if (i === correctIdx) b.classList.add("correct");
      else if (clickedBtn === b) b.classList.add("wrong");
    });
  }

  showFeedback(resp, answer);
}

function showFeedback(resp, answer) {
  const fb = $("feedback");
  const timedOut = answer == null || answer === "";
  const head = resp.isCorrect
    ? "✓ إجابة صحيحة!"
    : timedOut
    ? "⏱ انتهى الوقت"
    : "✗ إجابة خاطئة";
  fb.className = "feedback " + (resp.isCorrect ? "ok" : "no");
  fb.innerHTML = `
    <div class="feedback-head">${head}</div>
    ${resp.isCorrect ? `<div class="feedback-points">+${resp.points} نقطة</div>` : `<div class="feedback-answer">الإجابة الصحيحة: ${escapeHtml(resp.correctAnswer)}</div>`}
    <div class="feedback-exp">${escapeHtml(resp.explanation || "")}</div>
    <button id="nextBtn" class="btn ${resp.isCorrect ? "btn-primary" : "btn-accent"}">${isLast() ? "إنهاء ومشاهدة النتيجة" : "السؤال التالي ←"}</button>
  `;
  $("nextBtn").addEventListener("click", nextQuestion);
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
  const res = await api("/api/finish", "POST", { playerId: state.playerId });
  $("resultName").textContent = state.name;
  $("resultScore").textContent = res.score;
  $("resultCorrect").textContent = res.correctCount + " / " + res.total;
  renderReview(res.review || []);
  showScreen("screen-results");
}

// Render the per-question review (correct answers + explanations)
function renderReview(review) {
  const list = $("reviewList");
  list.innerHTML = "";
  review.forEach((item) => {
    const div = document.createElement("div");
    div.className = "review-item " + (item.isCorrect ? "ok" : "no");
    const mark = item.isCorrect ? "✓" : "✗";
    div.innerHTML = `
      <div class="review-q"><span class="review-num">${item.index}</span> ${escapeHtml(item.text)}</div>
      <div class="review-row"><span class="review-mark">${mark}</span> إجابتك: <b>${escapeHtml(item.yourAnswer)}</b></div>
      <div class="review-correct">الإجابة الصحيحة: <b>${escapeHtml(item.correctAnswer)}</b></div>
      <div class="review-exp">💡 ${escapeHtml(item.explanation || "")}</div>
    `;
    list.appendChild(div);
  });
}

// ===== Play again =====
$("playAgainBtn").addEventListener("click", () => {
  state.playerId = null;
  state.credential = null;
  if ($("playerName")) $("playerName").value = "";
  if ($("startBtn")) $("startBtn").disabled = false;
  // If Google is enabled, require sign-in again
  if (state.googleEnabled) {
    $("nameStep").classList.add("hidden");
    $("googleUserLine").textContent = "";
  }
  showScreen("screen-welcome");
});

// ===== Util =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
