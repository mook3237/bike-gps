const cards = [...document.querySelectorAll(".profile-card[data-profile]")];
const selectButton = document.querySelector("#selectButton");
const toast = document.querySelector("#toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

cards.forEach(card => {
  card.addEventListener("click", () => {
    cards.forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    document.querySelectorAll(".selected-mark").forEach(mark => mark.remove());
    const mark = document.createElement("span");
    mark.className = "selected-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "✓";
    card.prepend(mark);
  });
});

function addProfile() {
  showToast("프로필 추가 화면으로 이동");
}

document.querySelector("#addTop").addEventListener("click", addProfile);
document.querySelector("#addCard").addEventListener("click", addProfile);

selectButton.addEventListener("click", () => {
  const selected = document.querySelector(".profile-card.selected");
  RideMate.save({profile:selected?.dataset.profile || "나"}); location.href="/map/";
});
