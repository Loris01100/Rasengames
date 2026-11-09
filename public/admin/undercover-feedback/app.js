(() => {
  const $ = (id) => document.getElementById(id);
  let records = [];

  async function load() {
    const key = $("admin-key").value.trim();
    if (!key) return;
    $("load-btn").disabled = true;
    $("error").textContent = "";
    try {
      const response = await fetch("/api/undercover/feedback", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Clé incorrecte.");
      sessionStorage.setItem("undercover:admin-key", key);
      records = data.results ?? [];
      render();
    } catch (error) {
      $("error").textContent = error.message;
    } finally {
      $("load-btn").disabled = false;
    }
  }

  function render() {
    $("login").classList.add("hidden");
    $("results-panel").classList.remove("hidden");
    $("summary").textContent = `${records.length} paire${records.length > 1 ? "s" : ""} évaluée${records.length > 1 ? "s" : ""}. Aucun effet automatique sur les tirages.`;
    $("results").innerHTML = "";
    for (const record of records) {
      const row = document.createElement("tr");
      const percent = record.total ? Math.round(record.good * 100 / record.total) : 0;
      row.innerHTML = `<td><strong></strong><small></small></td><td></td><td>${record.good}</td><td>${record.easy}</td><td>${record.far}</td><td>${record.total}</td><td>${percent}%</td>`;
      row.children[0].children[0].textContent = `${record.a} / ${record.b}`;
      row.children[0].children[1].textContent = `${record.hintA} / ${record.hintB}`;
      row.children[1].textContent = record.category;
      $("results").appendChild(row);
    }
  }

  function downloadCsv() {
    const cells = records.map((record) => [
      record.a, record.b, record.hintA, record.hintB, record.category,
      record.good, record.easy, record.far, record.total,
    ]);
    const csv = [["Mot A", "Mot B", "Univers A", "Univers B", "Catégorie", "Bonne paire", "Trop facile", "Trop éloignée", "Total"], ...cells]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = "votes-undercover.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  $("load-btn").addEventListener("click", load);
  $("admin-key").addEventListener("keydown", (event) => { if (event.key === "Enter") load(); });
  $("csv-btn").addEventListener("click", downloadCsv);
  const saved = sessionStorage.getItem("undercover:admin-key");
  if (saved) { $("admin-key").value = saved; load(); }
})();
