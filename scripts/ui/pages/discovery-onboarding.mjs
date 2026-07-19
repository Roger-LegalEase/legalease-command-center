import { escapeAttribute, escapeHtml } from "../html.mjs";
import { DISCOVERY_ONBOARDING_CHOICES } from "../../discovery-onboarding-service.mjs";

export const DISCOVERY_ONBOARDING_STYLESHEET = "/assets/ui/discovery-onboarding.css";

export function renderDiscoveryOnboarding(contract = {}) {
  const choices = Array.isArray(contract.choices) && contract.choices.length ? contract.choices : DISCOVERY_ONBOARDING_CHOICES;
  const canSave = contract.capabilities?.canSave === true;
  return `<section class="discovery-onboarding" data-discovery-onboarding aria-labelledby="discovery-onboarding-title"${contract.shouldOpen === false ? " hidden" : ""}>
    <div class="discovery-onboarding-card" role="dialog" aria-modal="true" aria-describedby="discovery-onboarding-description" tabindex="-1">
      <p class="discovery-eyebrow">Welcome to LegalEase</p>
      <h1 id="discovery-onboarding-title">${escapeHtml(contract.title || "What would you like to do?")}</h1>
      <p id="discovery-onboarding-description">${escapeHtml(contract.description || "Choose a real workflow to start. You can return later.")}</p>
      <div class="discovery-onboarding-choices" role="list">
        ${choices.map((choice) => `<button type="button" role="listitem" data-onboarding-choice="${escapeAttribute(choice.id)}"${canSave ? "" : " disabled"}><strong>${escapeHtml(choice.label)}</strong><span>${escapeHtml(choice.description)}</span><span aria-hidden="true">→</span></button>`).join("")}
      </div>
      <p class="discovery-onboarding-status" data-onboarding-status role="status" aria-live="polite"></p>
      <footer><button type="button" data-onboarding-defer${canSave ? "" : " disabled"}>Skip for now</button><span>You can return from your profile menu.</span></footer>
    </div>
  </section>`;
}
