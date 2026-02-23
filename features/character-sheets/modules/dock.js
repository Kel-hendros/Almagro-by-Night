(function initABNSheetDock(global) {
  const state = {
    currentPage: 0,
    initialized: false,
  };

  function switchDockPage(pageIndex) {
    const pages = document.querySelectorAll(".dock-tab-page");
    const dots = document.querySelectorAll(".dock-dot");
    if (!pages.length || !dots.length) return;
    if (pageIndex < 0 || pageIndex >= pages.length) return;

    state.currentPage = pageIndex;
    pages.forEach((page) => page.classList.remove("active"));
    dots.forEach((dot) => dot.classList.remove("active"));
    pages[pageIndex].classList.add("active");
    dots[pageIndex].classList.add("active");

    const activePage = pages[pageIndex];
    const activeTab = activePage.querySelector(".dock-tab.active");
    if (!activeTab) {
      const firstTab = activePage.querySelector(".dock-tab");
      if (firstTab) firstTab.click();
    }
  }

  function bindPagerEvents() {
    document
      .getElementById("dock-prev")
      ?.addEventListener("click", () => switchDockPage(state.currentPage - 1));
    document
      .getElementById("dock-next")
      ?.addEventListener("click", () => switchDockPage(state.currentPage + 1));

    document.querySelectorAll(".dock-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        const page = parseInt(dot.getAttribute("data-page"), 10);
        switchDockPage(page);
      });
    });
  }

  function bindTabEvents() {
    const dockTabs = document.querySelectorAll(".dock-tab");
    dockTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const panelId = tab.getAttribute("data-panel");
        dockTabs.forEach((tabItem) => tabItem.classList.remove("active"));
        document
          .querySelectorAll(".dock-panel")
          .forEach((panel) => panel.classList.remove("active"));
        tab.classList.add("active");
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.add("active");
      });
    });
  }

  function init() {
    if (state.initialized) return;
    bindPagerEvents();
    bindTabEvents();
    state.initialized = true;
  }

  global.ABNSheetDock = {
    init,
    switchDockPage,
  };
})(window);
