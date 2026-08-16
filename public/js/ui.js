// Shared UI helpers reused across every game's app.js (no bundler, so plain global functions).

function makeAvatar(name) {
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = (name || "?").trim().charAt(0).toUpperCase();
  return avatar;
}
