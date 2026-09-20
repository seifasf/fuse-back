export const paymentProviders = {
  mock: {
    name: 'mock',
    async createPayment({ booking, returnUrl }) {
      return {
        provider: 'mock',
        paymentUrl: `${returnUrl}?bookingId=${booking._id}&status=success`,
        paymentRef: `mock_${booking._id}`,
      };
    },
    async verifyWebhook() {
      return { success: true };
    },
  },
  paymob: {
    name: 'paymob',
    async createPayment({ booking, returnUrl }) {
      // Stub  -  wire live Paymob keys in production
      return {
        provider: 'paymob',
        paymentUrl: `${returnUrl}?bookingId=${booking._id}&status=success&provider=paymob`,
        paymentRef: `paymob_${booking._id}`,
      };
    },
    async verifyWebhook(body) {
      return { success: body?.success === true || body?.obj?.success === true };
    },
  },
  myfatoorah: {
    name: 'myfatoorah',
    async createPayment({ booking, returnUrl }) {
      return {
        provider: 'myfatoorah',
        paymentUrl: `${returnUrl}?bookingId=${booking._id}&status=success&provider=myfatoorah`,
        paymentRef: `myfatoorah_${booking._id}`,
      };
    },
    async verifyWebhook(body) {
      return { success: body?.InvoiceStatus === 'Paid' || body?.status === 'success' };
    },
  },
};

export function getPaymentProvider(country, preferred) {
  if (preferred && paymentProviders[preferred]) return paymentProviders[preferred];
  if (country === 'EG') return paymentProviders.paymob;
  if (country === 'KW') return paymentProviders.myfatoorah;
  return paymentProviders.mock;
}
