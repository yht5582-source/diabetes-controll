const STORAGE_KEY = "diabetes-controll-evaluation-v1";

/*ENGINE-START*/
const scoreItems = [
  { key: "glucose", label: "血糖改善", weight: 0.35, hint: "HbA1c、空腹/飯後血糖或 CGM 趨勢較基準改善" },
  { key: "behavior", label: "行為改變", weight: 0.25, hint: "飲食、用藥、運動與血糖監測計畫有具體執行" },
  { key: "follow", label: "追蹤完成", weight: 0.15, hint: "依約完成回診或電話/線上追蹤，紀錄完整" },
  { key: "team", label: "跨職類協作", weight: 0.15, hint: "衛教師與營養師完成共同評估並整合建議" },
  { key: "selfCare", label: "病人自我管理", weight: 0.1, hint: "病人能說明主要問題、改善策略與低血糖處理" },
];

const grades = [
  { min: 85, label: "A 明顯改善", advice: "維持計畫，延長追蹤間隔或轉為例行追蹤。" },
  { min: 70, label: "B 部分改善", advice: "延續有效策略，針對未達成項目微調。" },
  { min: 60, label: "C 需加強", advice: "安排密集衛教或營養追蹤，確認主要障礙。" },
  { min: -Infinity, label: "D 需重新評估", advice: "建議召開跨職類討論，重新設定目標與治療策略。" },
];

const causes = [
  { label: "藥物順從性不佳", focus: "是否忘記服藥、漏藥、自行停藥或減量；是否因副作用、藥費、認知不足而未規則用藥", actions: [0] },
  { label: "飲食控制不佳", focus: "白飯、麵、粥、麵包、水果、含糖飲料、宵夜、外食、點心攝取是否過多", actions: [1] },
  { label: "運動量不足或久坐", focus: "每週運動次數、飯後活動量、久坐時間；是否有關節痛、心肺功能或肌少症限制", actions: [2] },
  { label: "藥物劑量或處方強度不足", focus: "HbA1c 未達標是否及時調藥；是否有治療惰性；是否需要加藥、換藥或開始胰島素", actions: [0] },
  { label: "胰島素使用問題", focus: "是否漏打、不敢調劑量、注射技術錯誤、保存不當、針頭重複使用、注射部位脂肪增生", actions: [4] },
  { label: "血糖監測不足或資料誤判", focus: "是否很少量血糖；是否只量空腹、不量飯後；是否有 SMBG／CGM 資料可供調整治療", actions: [3] },
  { label: "低血糖恐懼導致減藥或過度補食", focus: "是否曾發生低血糖、夜間低血糖；是否因害怕低血糖而刻意吃多或讓血糖偏高", actions: [5] },
  { label: "急性感染或身體壓力", focus: "是否有泌尿道感染、肺炎、牙周病、足部感染、手術、急性疾病、疼痛、失眠或壓力", actions: [6] },
  { label: "影響血糖的藥物或共病", focus: "是否使用類固醇、免疫抑制劑、部分精神科藥物；是否合併 CKD、肝病、心衰竭、甲狀腺疾病", actions: [0, 6] },
  { label: "心理、社會與照護障礙", focus: "是否有憂鬱、糖尿病倦怠、健康識能不足、家庭支持不足、經濟困難、交通困難或回診中斷", actions: [7] },
];

const actionItems = ["藥物調整", "飲食衛教", "運動建議", "血糖監測計畫", "胰島素注射衛教", "低血糖處理衛教", "感染／共病處理", "心理社會支持", "其他"];

const ranges = {
  a1c: { min: 3, max: 20, label: "HbA1c", unit: "%" },
  fasting: { min: 20, max: 800, label: "空腹血糖", unit: "mg/dL" },
  postMeal: { min: 20, max: 800, label: "飯後血糖", unit: "mg/dL" },
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function num(value) {
  if (isBlank(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoreSummary(scores) {
  let total = 0;
  let scored = 0;
  const rows = scoreItems.map((item) => {
    const raw = num(scores[item.key]);
    const valid = raw !== null && raw >= 0 && raw <= 5;
    const weighted = valid ? (raw / 5) * item.weight * 100 : null;
    if (valid) {
      total += weighted;
      scored += 1;
    }
    return { key: item.key, weighted };
  });
  const complete = scored === scoreItems.length;
  const grade = complete ? grades.find((g) => total >= g.min - 1e-9) : null;
  return { total, scored, complete, grade, rows };
}

function hasContent(row, fields) {
  return fields.some((field) => !isBlank(row[field]));
}

const followFields = ["evalDate", "followDate", "method", "fasting", "postMeal", "a1c", "change", "achievement", "nextStep", "doctorComment", "recorder"];

// Follow rows ordered by evaluation date; undated rows keep entry order after dated ones.
function orderedFollows(follows) {
  return follows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => hasContent(row, followFields))
    .sort((a, b) => {
      const da = a.row.evalDate || "";
      const db = b.row.evalDate || "";
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.index - b.index;
    });
}

function latestFollow(follows, predicate = () => true) {
  const list = orderedFollows(follows).filter(({ row }) => predicate(row));
  return list.length ? list[list.length - 1].row : null;
}

function a1cSummary(patient, follows) {
  const baseline = num(patient.baselineA1c);
  const target = num(patient.targetA1c);
  const latest = latestFollow(follows, (row) => num(row.a1c) !== null);
  const value = latest ? num(latest.a1c) : null;
  const out = { value, date: latest?.evalDate || "", baseline, target, delta: null, met: null };
  if (value !== null && baseline !== null) out.delta = Math.round((value - baseline) * 10) / 10;
  if (value !== null && target !== null) out.met = value <= target;
  return out;
}

function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// The newest follow row's planned date supersedes the initial plan.
function nextFollowDate(patient, follows, todayIso) {
  const latest = latestFollow(follows, (row) => !isBlank(row.followDate));
  const date = latest?.followDate || patient.plannedFollowDate || "";
  const source = latest?.followDate ? "follow" : patient.plannedFollowDate ? "plan" : "";
  const days = date && todayIso ? daysBetween(todayIso, date) : null;
  return { date, source, days };
}

function warnings(patient, follows) {
  const list = [];
  const check = (value, key, where) => {
    const n = num(value);
    const r = ranges[key];
    if (n !== null && (n < r.min || n > r.max)) list.push(`${where}${r.label} ${n} ${r.unit} 超出合理範圍（${r.min}–${r.max}），請確認`);
  };
  check(patient.baselineA1c, "a1c", "基準 ");
  check(patient.targetA1c, "a1c", "目標 ");
  if (patient.initialDate && patient.plannedFollowDate && patient.plannedFollowDate < patient.initialDate) list.push("預定後續評估日早於初次評估日期");
  follows.forEach((row, i) => {
    const where = `追蹤第 ${i + 1} 列：`;
    check(row.a1c, "a1c", where);
    check(row.fasting, "fasting", where);
    check(row.postMeal, "postMeal", where);
    if (row.evalDate && row.followDate && row.followDate < row.evalDate) list.push(`${where}後續評估日期早於本次評估日期`);
  });
  return list;
}

function suggestedActions(causeState) {
  const set = new Set();
  causeState.forEach((c, i) => {
    if (c.present === "是") causes[i].actions.forEach((a) => set.add(a));
  });
  return set;
}
/*ENGINE-END*/

const defaultRoles = [
  { role: "衛教師", focus: "用藥順從性、血糖監測、低血糖處理、自我照護能力" },
  { role: "營養師", focus: "餐次、醣量、外食、含糖飲料、點心與飲食紀錄" },
  { role: "醫師", focus: "治療強度、藥物副作用、共病與影響血糖藥物" },
  { role: "個案管理師", focus: "回診障礙、家庭支持、經濟與心理社會需求" },
];

const options = {
  dmType: ["第 2 型", "第 1 型", "妊娠糖尿病", "其他"],
  present: ["是", "否", "不確定", "不適用"],
  role: ["衛教師", "營養師", "醫師", "藥師", "個案管理師", "病人／家屬", "社工／心理師", "其他"],
  status: ["未開始", "進行中", "已完成", "暫緩／取消"],
  method: ["門診", "電話", "視訊", "LINE／簡訊", "居家紀錄回傳"],
  change: ["明顯改善", "部分改善", "無明顯改變", "惡化", "資料不足", "需重新評估"],
  achievement: ["達成", "部分達成", "未達成", "需調整目標", "失聯／未追蹤"],
};

const roleFields = ["role", "person", "focus", "finding", "suggestion", "status", "doctorComment", "followDate", "change"];

function blankRole(role = "", focus = "") {
  return { role, person: "", focus, finding: "", suggestion: "", status: "", doctorComment: "", followDate: "", change: "" };
}

function blankFollow(evalDate = "") {
  return Object.fromEntries(followFields.map((field) => [field, field === "evalDate" ? evalDate : ""]));
}

function freshState() {
  return {
    patient: {},
    scores: Object.fromEntries(scoreItems.map((item) => [item.key, ""])),
    scoreNotes: Object.fromEntries(scoreItems.map((item) => [item.key, ""])),
    causes: causes.map(() => ({ present: "", plan: "", status: "", note: "" })),
    actions: actionItems.map(() => ({ measure: "", owner: "", due: "", status: "", note: "" })),
    roles: defaultRoles.map((item) => blankRole(item.role, item.focus)),
    follows: [blankFollow()],
  };
}

let state = freshState();

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function el(id) {
  return document.getElementById(id);
}

function makeOptions(values, current = "") {
  return [`<option value=""></option>`, ...values.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`)].join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderScores() {
  el("scoreRows").innerHTML = scoreItems
    .map((item) => {
      const value = state.scores[item.key] ?? "";
      return `
        <div class="score-row">
          <div class="score-head">
            <span>${item.label}</span>
            <small>權重 ${Math.round(item.weight * 100)}%</small>
          </div>
          <select data-score="${item.key}" aria-label="${item.label}評分">
            <option value="" ${value === "" ? "selected" : ""}>未評</option>
            ${[0, 1, 2, 3, 4, 5].map((score) => `<option value="${score}" ${String(score) === String(value) ? "selected" : ""}>${score}</option>`).join("")}
          </select>
          <strong data-weighted="${item.key}">-</strong>
          <p class="score-hint">${item.hint}</p>
          <input class="score-note" data-score-note="${item.key}" value="${escapeHtml(state.scoreNotes[item.key])}" placeholder="佐證／備註" aria-label="${item.label}佐證" />
        </div>
      `;
    })
    .join("");
}

function renderCauses() {
  el("causeList").innerHTML = causes
    .map((cause, index) => {
      const row = state.causes[index];
      return `
        <div class="cause-row ${row.present === "是" ? "is-present" : ""}" data-cause-row="${index}">
          <div class="cause-text">
            <span class="cause-no">${index + 1}</span>
            <div>
              <strong>${cause.label}</strong>
              <p>${cause.focus}</p>
            </div>
          </div>
          <label class="cause-field">
            是否存在
            <select data-cause-index="${index}" data-field="present">${makeOptions(options.present, row.present)}</select>
          </label>
          <label class="cause-field cause-plan">
            個案說明／改善計畫
            <textarea data-cause-index="${index}" data-field="plan" rows="2">${escapeHtml(row.plan)}</textarea>
          </label>
          <label class="cause-field cause-status">
            完成狀態
            <select data-cause-index="${index}" data-field="status">${makeOptions(options.status, row.status)}</select>
          </label>
        </div>
      `;
    })
    .join("");
}

function renderActions() {
  const suggested = suggestedActions(state.causes);
  el("actionBody").innerHTML = actionItems
    .map((label, index) => {
      const row = state.actions[index];
      return `
      <tr class="${suggested.has(index) ? "is-suggested" : ""}" data-action-row="${index}">
        <th scope="row">${suggested.has(index) ? "＊" : ""}${label}</th>
        <td><textarea data-action-index="${index}" data-field="measure" rows="2">${escapeHtml(row.measure)}</textarea></td>
        <td><select data-action-index="${index}" data-field="owner">${makeOptions(options.role, row.owner)}</select></td>
        <td><input data-action-index="${index}" data-field="due" type="date" value="${escapeHtml(row.due)}" /></td>
        <td><select data-action-index="${index}" data-field="status">${makeOptions(options.status, row.status)}</select></td>
        <td><textarea data-action-index="${index}" data-field="note" rows="2">${escapeHtml(row.note)}</textarea></td>
      </tr>`;
    })
    .join("");
}

function renderRoles() {
  el("roleBody").innerHTML = state.roles
    .map(
      (row, index) => `
      <tr>
        <td><select data-role-index="${index}" data-field="role" aria-label="職類">${makeOptions(options.role, row.role)}</select></td>
        <td><input data-role-index="${index}" data-field="person" value="${escapeHtml(row.person)}" aria-label="人員" /></td>
        <td><textarea data-role-index="${index}" data-field="focus" rows="2" aria-label="評估重點">${escapeHtml(row.focus)}</textarea></td>
        <td><textarea data-role-index="${index}" data-field="finding" rows="2" aria-label="主要發現">${escapeHtml(row.finding)}</textarea></td>
        <td><textarea data-role-index="${index}" data-field="suggestion" rows="2" aria-label="改善建議">${escapeHtml(row.suggestion)}</textarea></td>
        <td><select data-role-index="${index}" data-field="status" aria-label="完成狀態">${makeOptions(options.status, row.status)}</select></td>
        <td><textarea data-role-index="${index}" data-field="doctorComment" rows="2" aria-label="醫師評論">${escapeHtml(row.doctorComment)}</textarea></td>
        <td><input data-role-index="${index}" data-field="followDate" type="date" value="${escapeHtml(row.followDate)}" aria-label="後續評估日期" /></td>
        <td><select data-role-index="${index}" data-field="change" aria-label="改變情況">${makeOptions(options.change, row.change)}</select></td>
        <td><button class="icon-button" type="button" data-remove-role="${index}" title="刪除此列" aria-label="刪除此列">×</button></td>
      </tr>
    `,
    )
    .join("");
}

function renderFollows() {
  el("followBody").innerHTML = state.follows
    .map(
      (row, index) => `
      <tr>
        <td><input data-follow-index="${index}" data-field="evalDate" type="date" value="${escapeHtml(row.evalDate)}" aria-label="本次評估日期" /></td>
        <td><input data-follow-index="${index}" data-field="followDate" type="date" value="${escapeHtml(row.followDate)}" aria-label="後續評估日期" /></td>
        <td><select data-follow-index="${index}" data-field="method" aria-label="追蹤方式">${makeOptions(options.method, row.method)}</select></td>
        <td><input class="num-input" data-follow-index="${index}" data-field="fasting" type="number" min="20" max="800" step="1" inputmode="numeric" value="${escapeHtml(row.fasting)}" aria-label="空腹血糖 mg/dL" /></td>
        <td><input class="num-input" data-follow-index="${index}" data-field="postMeal" type="number" min="20" max="800" step="1" inputmode="numeric" value="${escapeHtml(row.postMeal)}" aria-label="飯後血糖 mg/dL" /></td>
        <td><input class="num-input" data-follow-index="${index}" data-field="a1c" type="number" min="3" max="20" step="0.1" inputmode="decimal" value="${escapeHtml(row.a1c)}" aria-label="HbA1c %" /></td>
        <td><select data-follow-index="${index}" data-field="change" aria-label="改變情況">${makeOptions(options.change, row.change)}</select></td>
        <td><select data-follow-index="${index}" data-field="achievement" aria-label="達成情形">${makeOptions(options.achievement, row.achievement)}</select></td>
        <td><textarea data-follow-index="${index}" data-field="nextStep" rows="2" aria-label="下一步調整">${escapeHtml(row.nextStep)}</textarea></td>
        <td><textarea data-follow-index="${index}" data-field="doctorComment" rows="2" aria-label="醫師評論">${escapeHtml(row.doctorComment)}</textarea></td>
        <td><input data-follow-index="${index}" data-field="recorder" value="${escapeHtml(row.recorder)}" aria-label="記錄者" /></td>
        <td><button class="icon-button" type="button" data-remove-follow="${index}" title="刪除此列" aria-label="刪除此列">×</button></td>
      </tr>
    `,
    )
    .join("");
}

function fillPatientForm() {
  el("dmType").innerHTML = makeOptions(options.dmType, state.patient.dmType);
  document.querySelectorAll("#patientForm input, #patientForm textarea, #patientForm select").forEach((input) => {
    input.value = state.patient[input.name] ?? "";
  });
}

function renderAll() {
  fillPatientForm();
  renderCauses();
  renderActions();
  renderRoles();
  renderFollows();
  renderScores();
  updateSummary();
}

function formatDate(iso) {
  return iso ? iso.replaceAll("-", "/") : "";
}

function updateSummary() {
  const summary = scoreSummary(state.scores);
  summary.rows.forEach((row) => {
    const cell = document.querySelector(`[data-weighted="${row.key}"]`);
    if (cell) cell.textContent = row.weighted === null ? "-" : row.weighted.toFixed(1);
  });
  el("totalScore").textContent = summary.scored === 0 ? "—" : summary.total.toFixed(1);
  el("scoreProgress").textContent = summary.complete ? "5 面向皆已評分" : `${summary.scored}/5 面向已評分`;
  el("gradeText").textContent = summary.grade ? summary.grade.label : summary.scored === 0 ? "未評分" : "評分未完成";
  el("decisionText").textContent = summary.grade
    ? summary.grade.advice
    : summary.scored === 0
      ? "請填入各面向評分。"
      : `尚有 ${5 - summary.scored} 個面向未評分；全部評分後才判定等第（目前已得 ${summary.total.toFixed(1)} 分）。`;
  el("decisionText").dataset.grade = summary.grade ? summary.grade.label[0] : "";

  const a1c = a1cSummary(state.patient, state.follows);
  if (a1c.value !== null) {
    el("latestA1c").textContent = `${a1c.value}%`;
    const parts = [];
    if (a1c.date) parts.push(formatDate(a1c.date));
    if (a1c.delta !== null) parts.push(`較基準 ${a1c.delta > 0 ? "+" : ""}${a1c.delta}`);
    if (a1c.met !== null) parts.push(a1c.met ? `已達目標 ≤${a1c.target}` : `未達目標 ≤${a1c.target}`);
    el("a1cNote").textContent = parts.join("・");
  } else {
    el("latestA1c").textContent = a1c.baseline !== null ? `${a1c.baseline}%` : "無資料";
    el("a1cNote").textContent = a1c.baseline !== null ? "基準值（尚無追蹤）" : "";
  }
  el("latestA1c").dataset.met = a1c.met === null ? "" : String(a1c.met);

  const latest = latestFollow(state.follows, (row) => !isBlank(row.change));
  el("latestChange").textContent = latest?.change || "無資料";
  el("latestChangeDate").textContent = latest?.evalDate ? formatDate(latest.evalDate) : "";

  const next = nextFollowDate(state.patient, state.follows, todayIso());
  el("nextDate").textContent = next.date ? formatDate(next.date) : "未填寫";
  let note = next.source === "follow" ? "依最近追蹤紀錄" : next.source === "plan" ? "依初評預定" : "";
  if (next.days !== null) note += next.days < 0 ? `・已逾期 ${-next.days} 天` : next.days === 0 ? "・今天" : `・${next.days} 天後`;
  el("nextDateNote").textContent = note;
  el("nextDate").dataset.overdue = String(next.days !== null && next.days < 0);

  const present = state.causes.filter((c) => c.present === "是").length;
  const unsure = state.causes.filter((c) => c.present === "不確定").length;
  el("causeCount").textContent = present || unsure ? `存在 ${present} 項${unsure ? `・不確定 ${unsure} 項` : ""}` : "";

  const warn = warnings(state.patient, state.follows);
  const patientWarn = warn.filter((w) => !w.startsWith("追蹤"));
  const followWarn = warn.filter((w) => w.startsWith("追蹤"));
  el("patientWarning").hidden = !patientWarn.length;
  el("patientWarning").textContent = patientWarn.join("；");
  el("followWarning").hidden = !followWarn.length;
  el("followWarning").textContent = followWarn.join("；");
}

function save(silent = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const now = new Date();
    el("saveStatus").textContent = `已自動儲存於本機 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (!silent) showToast("已儲存到本機瀏覽器");
  } catch {
    el("saveStatus").textContent = "無法儲存到本機（瀏覽器封鎖儲存空間），請用「備份」下載資料";
  }
}

function scheduleSave() {
  clearTimeout(scheduleSave.timer);
  scheduleSave.pending = true;
  scheduleSave.timer = setTimeout(flushSave, 400);
}

function flushSave() {
  clearTimeout(scheduleSave.timer);
  if (!scheduleSave.pending) return;
  scheduleSave.pending = false;
  save();
}

function mergeRows(saved, fallback, makeBlank) {
  if (!Array.isArray(saved)) return fallback;
  return saved.map((row) => ({ ...makeBlank(), ...(row || {}) }));
}

function applySaved(saved) {
  const base = freshState();
  const roles = mergeRows(saved.roles, base.roles, blankRole).map((row) => {
    // v1 kept the role's focus only as a placeholder inside "主要發現"
    if (row.finding && row.focus && row.finding === row.focus) row.finding = "";
    return row;
  });
  return {
    patient: { ...(saved.patient || {}) },
    scores: { ...base.scores, ...(saved.scores || {}) },
    scoreNotes: { ...base.scoreNotes, ...(saved.scoreNotes || {}) },
    causes: base.causes.map((row, i) => ({ ...row, ...(saved.causes?.[i] || {}) })),
    actions: base.actions.map((row, i) => ({ ...row, ...(saved.actions?.[i] || {}) })),
    roles,
    follows: mergeRows(saved.follows, base.follows, blankFollow),
  };
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    state = applySaved(JSON.parse(raw));
    el("saveStatus").textContent = "已載入本機儲存的資料";
  } catch {
    showToast("讀取本機資料失敗");
  }
}

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStem() {
  return `糖尿病控制不良評估_${state.patient.chartNo || state.patient.patientName || "未命名"}_${todayIso()}`;
}

function exportCsv() {
  const p = state.patient;
  const summary = scoreSummary(state.scores);
  const a1c = a1cSummary(p, state.follows);
  const rows = [
    ["【基本資料】"],
    ["病人姓名", "病歷號", "評估人員", "糖尿病類型", "初次評估日期", "預定後續評估日", "基準 HbA1c (%)", "目標 HbA1c (%)", "目前治療方式", "主要問題", "醫師初評", "共同照護目標"],
    [p.patientName, p.chartNo, p.assessor, p.dmType, p.initialDate, p.plannedFollowDate, p.baselineA1c, p.targetA1c, p.treatment, p.primaryIssue, p.doctorInitial, p.careGoal],
    [],
    ["【常見控制不良原因檢核】"],
    ["編號", "常見原因", "是否存在", "個案說明／改善計畫", "完成狀態"],
    ...causes.map((c, i) => [i + 1, c.label, state.causes[i].present, state.causes[i].plan, state.causes[i].status]),
    [],
    ["【改善措施與追蹤】"],
    ["改善項目", "具體措施", "負責人員", "預定完成／追蹤時間", "完成狀態", "備註"],
    ...actionItems.map((label, i) => [label, state.actions[i].measure, state.actions[i].owner, state.actions[i].due, state.actions[i].status, state.actions[i].note]),
    [],
    ["【跨職類協作】"],
    ["職類", "人員", "評估重點", "主要發現", "改善建議", "完成狀態", "醫師評論", "後續評估日期", "改變情況"],
    ...state.roles.map((row) => roleFields.map((field) => row[field])),
    [],
    ["【追蹤紀錄】"],
    ["本次評估日期", "後續評估日期", "追蹤方式", "空腹血糖 (mg/dL)", "飯後血糖 (mg/dL)", "HbA1c (%)", "改變情況", "達成情形", "下一步調整", "醫師評論", "記錄者"],
    ...state.follows.filter((row) => hasContent(row, followFields)).map((row) => followFields.map((field) => row[field])),
    [],
    ["【評值系統】"],
    ["評值面向", "權重", "評分 (0-5)", "加權分數", "評分說明", "佐證／備註"],
    ...scoreItems.map((item, i) => [item.label, item.weight, state.scores[item.key], summary.rows[i].weighted === null ? "" : summary.rows[i].weighted.toFixed(1), item.hint, state.scoreNotes[item.key]]),
    ["總分", "", "", summary.scored ? summary.total.toFixed(1) : "", summary.grade ? summary.grade.label : `評分未完成 ${summary.scored}/5`, summary.grade ? summary.grade.advice : ""],
    ["最近 HbA1c", a1c.value ?? "", a1c.date, a1c.delta === null ? "" : `較基準 ${a1c.delta}`, a1c.met === null ? "" : a1c.met ? "已達目標" : "未達目標"],
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadBlob(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), `${fileStem()}.csv`);
}

function exportBackup() {
  const payload = { app: "diabetes-controll", version: 2, savedAt: new Date().toISOString(), data: state };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${fileStem()}.json`);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || typeof data !== "object" || !("patient" in data || "scores" in data || "follows" in data)) throw new Error("format");
      if (!window.confirm("匯入會取代目前畫面上的資料，確定嗎？")) return;
      state = applySaved(data);
      renderAll();
      save(true);
      showToast("已匯入備份");
    } catch {
      showToast("無法讀取：請選擇本工具「備份」產生的 JSON 檔");
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!window.confirm("確定要清除目前所有資料、開始新病人嗎？（建議先按「備份」）")) return;
  state = freshState();
  clearTimeout(scheduleSave.timer);
  scheduleSave.pending = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  renderAll();
  el("saveStatus").textContent = "已清除，開始新病人";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function confirmRemove(row, fields) {
  return !hasContent(row, fields) || window.confirm("此列已有資料，確定刪除？");
}

function attachEvents() {
  const onEdit = (event) => {
    const target = event.target;
    const { field } = target.dataset;
    if (target.closest("#patientForm") && target.name) {
      state.patient[target.name] = target.value;
    } else if (target.dataset.roleIndex !== undefined) {
      state.roles[Number(target.dataset.roleIndex)][field] = target.value;
    } else if (target.dataset.followIndex !== undefined) {
      state.follows[Number(target.dataset.followIndex)][field] = target.value;
    } else if (target.dataset.actionIndex !== undefined) {
      state.actions[Number(target.dataset.actionIndex)][field] = target.value;
    } else if (target.dataset.causeIndex !== undefined) {
      const index = Number(target.dataset.causeIndex);
      state.causes[index][field] = target.value;
      if (field === "present") {
        target.closest(".cause-row").classList.toggle("is-present", target.value === "是");
        const suggested = suggestedActions(state.causes);
        document.querySelectorAll("[data-action-row]").forEach((tr) => {
          const i = Number(tr.dataset.actionRow);
          tr.classList.toggle("is-suggested", suggested.has(i));
          tr.querySelector("th").textContent = `${suggested.has(i) ? "＊" : ""}${actionItems[i]}`;
        });
      }
    } else if (target.dataset.score) {
      state.scores[target.dataset.score] = target.value;
    } else if (target.dataset.scoreNote) {
      state.scoreNotes[target.dataset.scoreNote] = target.value;
    } else {
      return;
    }
    updateSummary();
    scheduleSave();
  };
  document.addEventListener("input", onEdit);
  document.addEventListener("change", onEdit);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.removeRole !== undefined) {
      const index = Number(button.dataset.removeRole);
      if (!confirmRemove(state.roles[index], ["person", "finding", "suggestion", "status", "doctorComment", "followDate", "change"])) return;
      state.roles.splice(index, 1);
      renderRoles();
      updateSummary();
      scheduleSave();
    }
    if (button.dataset.removeFollow !== undefined) {
      const index = Number(button.dataset.removeFollow);
      if (!confirmRemove(state.follows[index], followFields)) return;
      state.follows.splice(index, 1);
      if (!state.follows.length) state.follows.push(blankFollow());
      renderFollows();
      updateSummary();
      scheduleSave();
    }
  });

  el("addRoleBtn").addEventListener("click", () => {
    state.roles.push(blankRole());
    renderRoles();
    scheduleSave();
    el("roleBody").lastElementChild?.querySelector("select")?.focus();
  });

  el("addFollowBtn").addEventListener("click", () => {
    state.follows.push(blankFollow(todayIso()));
    renderFollows();
    updateSummary();
    scheduleSave();
    el("followBody").lastElementChild?.querySelector("[data-field='method']")?.focus();
  });

  el("newBtn").addEventListener("click", resetAll);
  el("exportBtn").addEventListener("click", exportCsv);
  el("backupBtn").addEventListener("click", exportBackup);
  el("printBtn").addEventListener("click", () => window.print());
  el("importInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importBackup(file);
    event.target.value = "";
  });
  window.addEventListener("pagehide", flushSave);
}

load();
renderAll();
attachEvents();
