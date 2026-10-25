// Engine tests: node tests.cjs
const fs = require("fs");
const vm = require("vm");
const src = fs.readFileSync(__dirname + "/app.js", "utf8");
const engine = src.slice(src.indexOf("/*ENGINE-START*/"), src.indexOf("/*ENGINE-END*/"));
const ctx = {};
vm.runInNewContext(engine + "\nObject.assign(this, { scoreSummary, latestFollow, a1cSummary, nextFollowDate, warnings, suggestedActions, daysBetween });", ctx);
let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}
const S = (o) => Object.assign({ glucose: "", behavior: "", follow: "", team: "", selfCare: "" }, o);

let r = ctx.scoreSummary(S({}));
eq("empty: no grade", [r.scored, r.complete, r.grade], [0, false, null]);
r = ctx.scoreSummary(S({ glucose: "5" }));
eq("partial: no grade", [r.scored, r.grade, r.total.toFixed(1)], [1, null, "35.0"]);
r = ctx.scoreSummary(S({ glucose: "5", behavior: "5", follow: "5", team: "5", selfCare: "5" }));
eq("all 5 → 100 A", [r.total.toFixed(1), r.grade.label], ["100.0", "A 明顯改善"]);
r = ctx.scoreSummary(S({ glucose: "0", behavior: "0", follow: "0", team: "0", selfCare: "0" }));
eq("all 0 → D", [r.complete, r.grade.label], [true, "D 需重新評估"]);
// 4,4,4,4,4 → 80 B ; boundary 85: 5,4,4,4,4 → 35+20+12+12+8 = 87
eq("80 → B", ctx.scoreSummary(S({ glucose: "4", behavior: "4", follow: "4", team: "4", selfCare: "4" })).grade.label, "B 部分改善");
eq("87 → A", ctx.scoreSummary(S({ glucose: "5", behavior: "4", follow: "4", team: "4", selfCare: "4" })).grade.label, "A 明顯改善");
// 3s → 60 exactly → C (floating point safe)
r = ctx.scoreSummary(S({ glucose: "3", behavior: "3", follow: "3", team: "3", selfCare: "3" }));
eq("60 → C", [r.total.toFixed(1), r.grade.label], ["60.0", "C 需加強"]);
// 70 boundary: glucose 4 (28) behavior 3 (15) follow 4 (12) team 4 (12) selfCare 4 (8) = 75 → B ; 0.35*... make exactly 70: all 3.5 impossible; use 4,3,3,4,4 = 28+15+9+12+8=72
eq("72 → B", ctx.scoreSummary(S({ glucose: "4", behavior: "3", follow: "3", team: "4", selfCare: "4" })).grade.label, "B 部分改善");
eq("out of range ignored", ctx.scoreSummary(S({ glucose: "9" })).scored, 0);

const follows = [
  { evalDate: "2026-09-01", followDate: "2026-10-01", a1c: "8.4", change: "部分改善" },
  { evalDate: "2026-06-01", followDate: "2026-09-01", a1c: "9.2", change: "無明顯改變" },
  { evalDate: "", followDate: "", a1c: "", change: "" },
];
eq("latest by date not order", ctx.latestFollow(follows).evalDate, "2026-09-01");
eq("latest change", ctx.latestFollow(follows, (x) => x.change).change, "部分改善");
let a = ctx.a1cSummary({ baselineA1c: "9.5", targetA1c: "7" }, follows);
eq("a1c summary", [a.value, a.delta, a.met], [8.4, -1.1, false]);
a = ctx.a1cSummary({ baselineA1c: "9.5", targetA1c: "8.5" }, follows);
eq("a1c met", a.met, true);
a = ctx.a1cSummary({ baselineA1c: "9.5" }, []);
eq("no follow a1c", [a.value, a.baseline], [null, 9.5]);

let n = ctx.nextFollowDate({ plannedFollowDate: "2026-07-01" }, follows, "2026-10-25");
eq("next date from latest follow, overdue", [n.date, n.source, n.days], ["2026-10-01", "follow", -24]);
n = ctx.nextFollowDate({ plannedFollowDate: "2026-11-01" }, [], "2026-10-25");
eq("next date from plan", [n.date, n.source, n.days], ["2026-11-01", "plan", 7]);
n = ctx.nextFollowDate({}, [], "2026-10-25");
eq("no next date", [n.date, n.days], ["", null]);

let w = ctx.warnings({ baselineA1c: "72", initialDate: "2026-05-01", plannedFollowDate: "2026-04-01" }, [{ evalDate: "2026-05-02", followDate: "2026-05-01", fasting: "1300", a1c: "7.2" }]);
eq("warnings count", w.length, 4);
eq("no warnings normal", ctx.warnings({ baselineA1c: "9.1", targetA1c: "7" }, [{ fasting: "130", postMeal: "180", a1c: "7.4" }]).length, 0);

const causesState = Array.from({ length: 10 }, () => ({ present: "" }));
causesState[1].present = "是";
causesState[8].present = "是";
causesState[4].present = "不確定";
eq("suggested actions", [...ctx.suggestedActions(causesState)].sort(), [0, 1, 6]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
