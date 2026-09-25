/**
 * Frontend Admin Seller Verification Handler
 * File: frontend/src/admin/sellers.js
 */

export async function confirmKycVerification(sellerId, isApprove = true) {
  const status = isApprove ? 'VERIFIED' : 'REJECTED';
  const confirmMsg = isApprove 
    ? 'Confirm and approve this seller for the platform?' 
    : 'Reject this seller KYC submission?';
    
  if (!confirm(confirmMsg)) return;

  try {
    const adminToken = localStorage.getItem('adminToken') || 
                       localStorage.getItem('token') || 
                       sessionStorage.getItem('tohfa_admin_token') || 
                       localStorage.getItem('tohfa_admin_token');
    const res = await fetch(`/api/admin/sellers/${sellerId}/verify-kyc`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(data.message || 'Failed to update KYC status');
      return;
    }

    alert(`Seller ${status.toLowerCase()} successfully!`);
    if (typeof closeKycModal === 'function') closeKycModal();
    if (typeof loadSellersTable === 'function') loadSellersTable();
    else if (typeof fetchSellers === 'function') {
      fetchSellers();
    } else {
      window.location.reload();
    }
  } catch (err) {
    console.error('Error confirming verification:', err);
    alert('Network error while confirming verification.');
  }
}

if (typeof window !== 'undefined') {
  window.confirmKycVerification = confirmKycVerification;
}
