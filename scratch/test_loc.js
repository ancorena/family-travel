const state = {
  members: {
    "m1": { name: "爸爸" },
    "m2": { name: "媽媽" }
  }
};
function getDayLocationText(dayObj) {
  if (!dayObj) return "";
  if (dayObj.memberLocations && Object.keys(dayObj.memberLocations).length > 0) {
    const locs = {};
    Object.keys(dayObj.memberLocations).forEach(mId => {
      const loc = dayObj.memberLocations[mId];
      if (!locs[loc]) locs[loc] = [];
      locs[loc].push(state.members[mId]?.name || mId);
    });
    const locKeys = Object.keys(locs);
    if (locKeys.length === 1 && Object.keys(dayObj.memberLocations).length === Object.keys(state.members).length) {
      return locKeys[0]; // All members have the same location
    }
    return locKeys.map(loc => `${loc} (${locs[loc].join("、")})`).join("、");
  }
  return dayObj.location || "";
}
const dayObj = { memberLocations: { m1: "東京" } };
console.log(getDayLocationText(dayObj));
