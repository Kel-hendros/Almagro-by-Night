(function initABNSheetRatingDots(global) {
  function updateDots(rating) {
    let input = rating.nextElementSibling;
    if (!input || input.type !== "hidden") {
      const wrap = rating.closest(".attr-rating-wrap");
      if (wrap) input = wrap.nextElementSibling;
    }
    if (!input) return;

    const dots = rating.querySelectorAll(".dot");
    const value = parseInt(input.value, 10);
    dots.forEach((dot, index) => {
      if (index < value) {
        dot.classList.add("filled");
      } else {
        dot.classList.remove("filled");
      }
    });
  }

  global.ABNSheetRatingDots = {
    updateDots,
  };
})(window);
