// Paste this into Chrome DevTools > Sources > Snippets > New snippet > Run

clearInterval(window.itemManager._apiPollInterval);
window.itemManager._apiPollInterval = null;

var orig = console.log;
console.log = function() {
  var a = arguments[0] || "";
  if (typeof a === "string" && a.indexOf("syncFromApi") !== -1) return;
  if (typeof a === "string" && a.indexOf("[API]") !== -1) return;
  orig.apply(console, arguments);
};
console.log("=== verify start ===");

var V = window.V;

// ====== test 1: announce too long ======
await V.clean();
var r1 = await V.apply(4, null, {content: "a".repeat(101)});
console.log("TEST1 announce 101 chars: code=" + r1.code + " msg=" + r1.message);

// ====== test 2: lock release delay ======
await V.clean();
await V.apply(5, null, {time_hm: 1200});
await new Promise(function(x){setTimeout(x,300)});
var rec = await V.records();
var d = rec.extra.records.find(function(r){ return r.skill_id===5 && r.status==="todo"; });
await V.gm(d.record_id);
await new Promise(function(x){setTimeout(x,200)});
var r2 = await V.apply(5, null, {time_hm: 1300});
console.log("TEST2 lock release delay: code=" + r2.code + " msg=" + r2.message);

// ====== test 3: benefits not consumed ======
await V.clean();
var ben1 = await V.get("/userListBenefits");
var w1 = ben1.extra.benefits.filter(function(b){ return b.skill_id===2; }).reduce(function(s,b){return s+(b.left_times||0)},0);
console.log("TEST3 weather before=" + w1);

for (var i=0; i<w1; i++) {
    var a = await V.apply(2, null, {weather_id: 1});
    if (a.code===0) {
        var rec2 = await V.records();
        var d2 = rec2.extra.records.find(function(r){ return r.skill_id===2 && r.status==="todo"; });
        if (d2) await V.gm(d2.record_id);
    }
    await new Promise(function(x){setTimeout(x,300)});
}

var ben2 = await V.get("/userListBenefits");
var w2 = ben2.extra.benefits.filter(function(b){ return b.skill_id===2; }).reduce(function(s,b){return s+(b.left_times||0)},0);
console.log("TEST3 weather after=" + w2);
var r3 = await V.apply(2, null, {weather_id: 1});
console.log("TEST3 weather apply when 0: code=" + r3.code + " msg=" + r3.message);

console.log("=== verify done ===");
