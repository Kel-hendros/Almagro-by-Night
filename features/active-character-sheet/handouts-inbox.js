(function initActiveSheetHandoutsInbox(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let messageHandler = null;

  function onMessage(event) {
    if (event.data?.type !== "abn-open-revelation-view") return;
    const rs = global.ABNShared?.revelationScreen;
    if (rs) {
      rs.openView({
        title: event.data.title,
        bodyMarkdown: event.data.bodyMarkdown,
        imageUrl: event.data.imageUrl,
        tags: event.data.tags,
      });
    }
  }

  function init() {
    if (messageHandler) return;
    messageHandler = onMessage;
    window.addEventListener("message", messageHandler);
  }

  function destroy() {
    if (messageHandler) {
      window.removeEventListener("message", messageHandler);
      messageHandler = null;
    }
  }

  ns.handoutsInbox = {
    init,
    destroy,
  };
})(window);
