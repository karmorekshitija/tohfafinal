/**
 * Tohfa Seller Studio Wizard State Manager
 */
window.WizardState = {
  currentStep: 1,
  data: {},
  setStep(step) {
    this.currentStep = step;
  },
  saveDraft() {
    try {
      sessionStorage.setItem('tohfa_product_draft', JSON.stringify(this.data));
    } catch(e) {}
  }
};
