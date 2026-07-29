export const mockCustomers = [
  {
    customerRef: 'cliente_mock_001',
    name: 'Cliente Teste M2',
    cpf: '000.000.000-00',
    phone: '5581999990001',
    contractStatus: 'active',
    invoices: [
      {
        invoiceRef: 'fat_mock_2026_07',
        status: 'open',
        dueDate: '2026-07-31',
        amount: 99.9,
        paymentLine: '34191.79001 01043.510047 91020.150008 8 00000000009990',
        pdfUrl: 'https://example.invalid/boleto-mock.pdf',
      },
    ],
  },
];
