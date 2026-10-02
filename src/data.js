export const sampleSellers = [
  { id: 'demo-seller-1', name: 'Common Field Studio', website_url: 'https://example.com', is_active: true },
  { id: 'demo-seller-2', name: 'Stillroom Goods', website_url: 'https://example.com', is_active: true },
  { id: 'demo-seller-3', name: 'Northline Objects', website_url: 'https://example.com', is_active: true },
];

export const sampleProducts = [
  { id: 'sample-arc-lamp', seller_id: 'demo-seller-1', seller_name: 'Common Field Studio', name: 'Arc Table Lamp', category: 'HOME', description: 'Warm, sculptural light for slower evenings.', price_label: '₹2,499', price_amount: 2499, currency: 'INR', stock_status: 'available', buy_url: '', image_url: '/products/arc-lamp.jpg', art_variant: 'lamp', is_active: true, featured: true },
  { id: 'sample-form-bottle', seller_id: 'demo-seller-2', seller_name: 'Stillroom Goods', name: 'Form Everyday Bottle', category: 'EVERYDAY', description: 'A considered companion for the daily commute.', price_label: '₹899', price_amount: 899, currency: 'INR', stock_status: 'available', buy_url: '', image_url: '/products/form-bottle.jpg', art_variant: 'bottle', is_active: true, featured: true },
  { id: 'sample-quiet-mat', seller_id: 'demo-seller-3', seller_name: 'Northline Objects', name: 'Quiet Desk Mat', category: 'WORKSPACE', description: 'A softer surface for a clearer working day.', price_label: '₹1,199', price_amount: 1199, currency: 'INR', stock_status: 'available', buy_url: '', image_url: '/products/quiet-mat.jpg', art_variant: 'mat', is_active: true, featured: false },
  { id: 'sample-studio-audio', seller_id: 'demo-seller-1', seller_name: 'Common Field Studio', name: 'Studio Wireless Audio', category: 'TECH', description: 'Simple sound, designed to fit your routine.', price_label: '₹2,999', price_amount: 2999, currency: 'INR', stock_status: 'available', buy_url: '', image_url: '/products/studio-audio.jpg', art_variant: 'audio', is_active: true, featured: true },
  { id: 'sample-ceramic-set', seller_id: 'demo-seller-2', seller_name: 'Stillroom Goods', name: 'Ceramic Catchall Set', category: 'HOME', description: 'A small detail to bring order to a room.', price_label: '₹749', price_amount: 749, currency: 'INR', stock_status: 'available', buy_url: '', image_url: '/products/ceramic-catchall.jpg', art_variant: 'ceramic', is_active: true, featured: false },
  { id: 'sample-fold-tote', seller_id: 'demo-seller-3', seller_name: 'Northline Objects', name: 'Fold Everyday Tote', category: 'EVERYDAY', description: 'Lightweight, unfussy, and ready to go.', price_label: '₹599', price_amount: 599, currency: 'INR', stock_status: 'available', buy_url: '', image_url: '/products/fold-tote.jpg', art_variant: 'tote', is_active: true, featured: false },
];

export const sampleOrders = [
  { id: 'demo-record-001', user_id: 'preview-member', product_id: 'sample-arc-lamp', seller_id: 'demo-seller-1', seller_name_snapshot: 'Common Field Studio', product_name: 'Arc Table Lamp', customer_name: 'Demo Member', contact_email: 'member@preview.local', order_reference: 'SAMPLE-ORDER-001', order_date: '2026-09-18', amount: 2499, currency: 'INR', status: 'Submitted', order_screenshot_path: 'demo-file:order-proof.png', delivery_screenshot_path: '', created_at: '2026-09-18T11:30:00.000Z' },
  { id: 'demo-record-002', user_id: 'preview-member', product_id: 'sample-form-bottle', seller_id: 'demo-seller-2', seller_name_snapshot: 'Stillroom Goods', product_name: 'Form Everyday Bottle', customer_name: 'Demo Member', contact_email: 'member@preview.local', order_reference: 'SAMPLE-ORDER-002', order_date: '2026-09-24', amount: 899, currency: 'INR', status: 'Submitted', order_screenshot_path: 'demo-file:order-proof-2.png', delivery_screenshot_path: 'demo-file:delivery-proof.png', created_at: '2026-09-24T09:15:00.000Z' },
];

export const sampleFeedback = [
  { id: 'demo-feedback-001', order_record_id: 'demo-record-001', seller_id: 'demo-seller-1', seller_name_snapshot: 'Common Field Studio', product_name: 'Arc Table Lamp', usage_period: 'About one week', what_worked: 'Example private feedback: the warm light suited my reading corner.', improvements: 'Example suggestion: the switch could be easier to reach.', private_notes: '', submitted_at: '2026-09-25T08:45:00.000Z' },
];

export const sampleSupportRequests = [
  { id: 'demo-support-001', order_record_id: 'demo-record-002', seller_id: 'demo-seller-2', seller_name_snapshot: 'Stillroom Goods', contact_email: 'member@preview.local', topic: 'Delivery question', details: 'This is sample support history. Replace it with a real request after Supabase is configured.', status: 'Received', created_at: '2026-09-24T10:20:00.000Z' },
];
