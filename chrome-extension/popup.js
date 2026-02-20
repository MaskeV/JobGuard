// popup.js — JobGuard Chrome Extension
const API_URL       = "http://localhost:5000/api";
const EXT_SECRET    = "your_random_secret_string_here"; // Must match backend .env

const titleEl   = document.getElementById("title");
const companyEl = document.getElementById("company");
const urlEl     = document.getElementById("url");
const saveBtn   = document.getElementById("save");
const statusEl  = document.getElementById("status");

function setStatus(msg, color = "#94a3b8") {
  statusEl.style.color = color;
  statusEl.textContent = msg;
}

// ── On popup open: inject content script and read extracted data ──────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setStatus("No active tab", "#f87171"); return; }

  // Inject content.js if not already injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (_) { /* already injected */ }

  // Read extracted data
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__jobguardData || { url: location.href, title: document.title, company: "", description: "" },
  });

  const data = results?.[0]?.result || {};
  titleEl.value   = data.title   || "";
  companyEl.value = data.company || "";
  urlEl.value     = data.url     || tab.url || "";

  // Check if already saved
  const stored = await chrome.storage.local.get("savedUrls");
  const saved  = stored.savedUrls || [];
  if (saved.includes(urlEl.value)) {
    setStatus("✓ Already in your tracker", "#5eead4");
    saveBtn.textContent = "Already Saved";
    saveBtn.disabled    = true;
    saveBtn.style.opacity = "0.5";
  }
})();

// ── Save button ───────────────────────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  if (!titleEl.value.trim()) { setStatus("Please enter a job title", "#f87171"); return; }

  saveBtn.disabled     = true;
  saveBtn.textContent  = "Saving...";
  setStatus("Connecting to JobGuard...");

  try {
    const res = await fetch(`${API_URL}/jobs/extension`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-extension-secret": EXT_SECRET },
      body: JSON.stringify({
        url:         urlEl.value,
        title:       titleEl.value,
        company:     companyEl.value,
        description: window.__jobguardData?.description || "",
      }),
    });

    const data = await res.json();

    if (data.duplicate) {
      setStatus("Already in your tracker!", "#fbbf24");
      saveBtn.textContent = "Already Saved";
    } else if (data.job) {
      setStatus("✓ Saved to JobGuard!", "#5eead4");
      saveBtn.textContent = "Saved ✓";

      // Remember this URL
      const stored = await chrome.storage.local.get("savedUrls");
      const list   = stored.savedUrls || [];
      list.push(urlEl.value);
      await chrome.storage.local.set({ savedUrls: list });
    } else {
      setStatus("Failed to save — is backend running?", "#f87171");
      saveBtn.disabled    = false;
      saveBtn.textContent = "Retry";
    }
  } catch (err) {
    setStatus("Backend offline — start server first", "#f87171");
    saveBtn.disabled    = false;
    saveBtn.textContent = "Retry";
    console.error("JobGuard extension error:", err);
  }
});