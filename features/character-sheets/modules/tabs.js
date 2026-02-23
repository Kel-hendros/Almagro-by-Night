(function initABNSheetTabs(global) {
  function init() {
    const tabs = document.querySelectorAll(".tab-button");
    const contents = document.querySelectorAll(".tab-content");
    if (!tabs.length || !contents.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((tabItem) => tabItem.classList.remove("active"));
        tab.classList.add("active");

        contents.forEach((content) => content.classList.remove("active"));
        const tabContentId = tab.dataset.tab;
        if (!tabContentId) return;
        const panel = document.getElementById(tabContentId);
        if (panel) panel.classList.add("active");
      });
    });
  }

  global.ABNSheetTabs = {
    init,
  };
})(window);
