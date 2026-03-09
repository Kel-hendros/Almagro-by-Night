(function initPublicRecapController(global) {
  const ns = (global.ABNPublicRecap = global.ABNPublicRecap || {});

  function service() {
    return ns.service || null;
  }

  function recapScreen() {
    return global.ABNShared?.recapScreen || null;
  }

  function buildChronicleHash(share) {
    return `chronicle?id=${encodeURIComponent(share.chronicle_id)}&recap=${encodeURIComponent(share.recap_id)}`;
  }

  async function initPage() {
    const api = service();
    if (!api) return;

    const { token } = api.getHashContext();
    if (!token) {
      window.location.hash = "welcome";
      return;
    }

    const { data: share, error } = await api.fetchPublicShare(token);
    if (error || !share) {
      console.error("PublicRecap: no se pudo resolver share", error);
      global.alert("No se pudo abrir este recuento compartido.");
      window.location.hash = "welcome";
      return;
    }

    const session = await api.getSession();
    if (session) {
      const currentPlayer = await api.getCurrentPlayerByUserId(session.user.id);
      const participation = currentPlayer?.id
        ? await api.getParticipation(share.chronicle_id, currentPlayer.id)
        : null;
      const hasChronicleAccess =
        Boolean(participation) ||
        String(currentPlayer?.id || "") === String(share.chronicle_creator_id || "");

      if (hasChronicleAccess) {
        window.location.hash = buildChronicleHash(share);
        return;
      }
    }

    await recapScreen()?.showPublicShare?.({
      share,
      onClosed: () => {
        if ((window.location.hash || "").startsWith("#public-recap")) {
          window.location.hash = "welcome";
        }
      },
    });
  }

  ns.controller = {
    initPage,
  };
})(window);
