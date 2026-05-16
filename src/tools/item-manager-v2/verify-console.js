var V = {};
V.base = "https://monsteraccounttest.yuemei.info/activity/gmSkill";
V.sid = "750748016054341";
V.h = { "Content-Type": "application/json", "AuthToken": localStorage.getItem("itemManager_api_token") || "" };

V.get = async function(p) {
    var r = await fetch(V.base + p, { headers: V.h });
    return r.json();
};
V.post = async function(p, b) {
    var r = await fetch(V.base + p, { method: "POST", headers: V.h, body: JSON.stringify(b) });
    return r.json();
};
V.records = function() { return V.get("/userListRecords"); };
V.gm = function(id) { return V.get("/gmSuccess/" + id); };
V.apply = function(skillId, sid, params) {
    params = params || {};
    return V.post("/userApply", {
        skill_id: skillId,
        server_id: sid || V.sid,
        weather_id: params.weather_id || 0,
        time_hm: params.time_hm || 0,
        content: params.content || ""
    });
};
V.clean = async function() {
    var rec = await V.records();
    var list = rec.extra && rec.extra.records ? rec.extra.records : [];
    var doing = list.filter(function(r) { return r.status === "doing" || r.status === "1"; });
    console.log("clean " + doing.length + " records");
    for (var i = 0; i < doing.length; i++) {
        await V.gm(doing[i].record_id);
        await new Promise(function(x) { setTimeout(x, 300); });
    }
    console.log("done");
};

window.V = V;
console.log("loaded");
console.log("V.apply(5,null,{time_hm:1200}) - time card");
console.log("V.apply(3) - flow card");
console.log("V.apply(1) - dino grow");
console.log("V.apply(2,null,{weather_id:1}) - weather");
console.log("V.apply(4,null,{content:'xxx'}) - announce");
console.log("V.clean() - cleanup all");
