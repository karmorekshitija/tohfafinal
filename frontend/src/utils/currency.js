export function formatPaise(paise) {
  if (paise == null) return '₹0.00';
  const rupees = paise / 100;
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
