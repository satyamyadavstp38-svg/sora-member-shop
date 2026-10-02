# SORA Market — multi-seller shop starter

A polished, responsive marketplace starter for a mixed catalogue of independent sellers. The storefront opens directly on the shopping page, with a large search bar, category navigation, seller and price filters, sorting, realistic sample product photography, and product cards. Members can continue to the seller’s own product page, submit order details, view their account history, and send private product-testing feedback.

## Storefront and member flow

- **Direct shop landing:** visitors arrive at the product catalogue rather than a separate welcome screen. Visitors can browse/search; signing in is required before opening a seller checkout link or accessing member forms/history.
- **Multi-seller catalogue:** every product is assigned to a seller and shown in the same storefront. Search covers product names, categories, and seller names. Category, seller, compact price-range dropdown, and sort filters sit together above the product grid.
- **Buy now:** opens the assigned product’s HTTPS URL in a new tab. Checkout and payment remain on the seller’s website.
- **Order details form:** records customer name, signed-in email, product/seller, order reference, order date, amount, required order screenshot, optional delivery screenshot, and server submission time.
- **Member profile:** a signed-in member sees only their own order forms, reported order total, private feedback, and support activity. Each order clearly shows saved form status and whether private feedback is pending or submitted, with the right next-step button.
- **Private product-testing feedback:** opened from a member’s order history. It asks what worked and what could improve; it has no public-review or star-rating field.
- **Separate support flow:** delivery, return, refund follow-up, and product questions are stored separately. No payout or refund-decision workflow is attached to testing feedback.
- **Admin-only operations:** a hidden-from-members admin area provides an account directory, per-member order totals (self-reported), signup/last-sign-in timestamps, order/feedback/support counts, member drill-down, seller filters, seller/product editing, reversible hide/restore controls, available/sold-out status, support status updates, and separate CSV exports. Hiding a seller or product preserves historical records.
- **Times and access:** database `timestamptz` values are displayed in Asia/Kolkata time. Supabase Row Level Security limits members to their own submissions. Only the allow-listed site admin can see cross-member records; a guarded SQL RPC exposes the minimal account directory only to that admin.

## Checkout and privacy limits

- A normal seller-page link cannot confirm that a customer completed a purchase. Order entries are self-reported; this starter does not verify purchases with seller websites.
- Never request a seller-site password or payment-card details. Screenshots are stored in a private Supabase Storage bucket. Members see their own files; the site admin can review submissions.
- Publish a privacy notice that explains account email, order references, screenshots, feedback, seller sharing, retention, and deletion. Share only the information each seller needs.
- Sellers do not receive accounts or direct access in this build. The admin can review and export seller-filtered information.
- The site excludes public review/rating collection and any refund, payment, or reimbursement condition linked to reviews or ratings. Private product-testing feedback is not published.
- Sample products, sellers, prices, and generated sample photos are for preview only. Replace them with accurate seller listings and authorized product images before launch.

## Run the interactive preview

```bash
npm install
npm run dev
```

Without Supabase variables, the development preview opens directly as a demo member; no admin link is shown to that member. For owner-only local UI testing, open the dev URL with `?preview=admin` (the switch is disabled in production and ignored when Supabase is configured). Demo changes and file selections stay in browser memory and are not sent to a server. A production build without Supabase configuration fails closed: it shows no demo records and account actions remain unavailable. Do not enter real customer data in demo mode.

## Configure Supabase

1. Create a Supabase project.
2. In its SQL Editor, run `supabase/schema.sql`. It creates `sellers`, `catalog_products`, `order_submissions`, `testing_feedback`, `member_support_requests`, private evidence storage, and RLS policies.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to your live Vercel domain and allow it (for example, `https://sora-member-shop.vercel.app/**`). Add `http://localhost:5173/**` only if you also test locally. This app uses a six-digit email OTP that members type into the site. For dependable delivery, configure a custom SMTP sender in Supabase; the default sender is rate-limited.
4. In Supabase **Authentication → Email Templates**, edit both **Magic Link** and **Confirm signup** templates so they show `{{ .Token }}` as the verification code (instead of relying on `{{ .ConfirmationURL }}`). For example, the body can say: “Your SORA sign-in code is {{ .Token }}. Enter this six-digit code on the sign-in page.” Save both templates. The frontend calls `verifyOtp` and expects a code, not a clickable email link.
5. Copy `.env.example` to `.env` and add your project URL and **anon/publishable** key:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

6. Sign in on the shop with your owner email and enter the emailed OTP. In Supabase **Authentication → Users**, copy that account’s UUID. Add it through the SQL Editor:

   ```sql
   insert into public.site_admins (user_id) values ('YOUR_AUTH_USER_UUID') on conflict (user_id) do nothing;
   ```

7. Visit `/admin` on your deployed site. The separate Admin page sends an OTP only to an existing account, then checks the `site_admins` allow-list before showing any admin workspace. Add sellers and products from its **Sellers & products** tab. There is no shared password embedded in the frontend; that would be visible to every visitor.
8. Restart the dev server after editing `.env`; deploy to a host that supports environment variables and allow its domain in Supabase Auth URL settings.

**Never put a Supabase `service_role`/secret key in browser code or any `VITE_` variable.** Only the public anon/publishable key belongs in the client, with RLS enabled. Review the privacy, retention, and access model before collecting real customer information.

## Deploy to Vercel

1. Push the project folder to a GitHub repository. Keep the repository private if you prefer; do **not** commit `.env` or any Supabase secret/service-role key. The included `.gitignore` excludes local environment files, `node_modules`, and `dist`.
2. In Vercel, choose **Add New → Project**, import that GitHub repository, and keep the project root at the folder containing `package.json`.
3. Use the Vite settings (Vercel usually detects these automatically): install `npm install`, build `npm run build`, output directory `dist`.
4. Before deploying, open the Vercel project’s **Settings → Environment Variables** and add these for Production (and Preview if you will test preview deployments):

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

   In the current Supabase dashboard, copy the **Project URL** from **Project Settings → Data API** (root only, like `https://your-project.supabase.co`; do not use a REST endpoint ending in `/rest/v1`) and the key from **Project Settings → API Keys → Publishable key** (or the legacy anon key). The app variable is still named `VITE_SUPABASE_ANON_KEY`; paste the publishable key into it. These are browser-side public values; never use a `service_role` or Secret key in a `VITE_` variable.
5. Click **Deploy**. Copy the resulting `https://….vercel.app` domain. In Supabase **Authentication → URL Configuration**, set that as the Site URL and allow it (for example, `https://sora-member-shop.vercel.app/**`). Add your custom domain too if you attach one later. Vercel’s included `vercel.json` routes `/admin` to the app.
6. Visit the deployed shop and sign in with the email you want to use as the owner/admin; enter the OTP from the email. In Supabase **Authentication → Users**, copy that account’s UUID. Run this in the Supabase SQL Editor:

   ```sql
   insert into public.site_admins (user_id) values ('YOUR_AUTH_USER_UUID');
   ```

   Sign out/in, then open `/admin`; only that allow-listed account can pass the Admin check. The shop remains available at `/`.
7. In the Admin area, add your real sellers and products, product-page URLs, current prices, and authorized product images. The preview samples are not automatically inserted into Supabase. Test email-code sign-in, Admin denial for a non-allow-listed account, seller/product hide and restore, sold-out status, order submission, private account history, and admin exports before sharing the site.
8. Whenever you change Vercel environment variables, redeploy so the new values are included in the Vite build. Vercel will automatically build future commits pushed to the connected GitHub branch.

### If sign-in does not work

- Confirm Vercel shows a **Ready** Production deployment. A project card with **No Production Deployment** is only a project shell; its site is not live yet.
- Confirm the Vercel Production environment has `VITE_SUPABASE_URL` (the Supabase Project URL) and `VITE_SUPABASE_ANON_KEY` (the Supabase Publishable key). Redeploy after adding or changing either value.
- In Supabase **Authentication → URL Configuration**, set Site URL to `https://sora-member-shop.vercel.app` and allow `https://sora-member-shop.vercel.app/**`. Use your actual Vercel production domain if it differs.
- The app requests a six-digit email OTP. In Supabase **Authentication → Email Templates**, both **Magic Link** and **Confirm signup** templates must include `{{ .Token }}`. If email contains only a link, update the templates and save them; the app is waiting for a code to enter.
- If verification fails, request a fresh code and use the newest message. Check Spam/Promotions and configure custom SMTP before inviting many users; Supabase’s default sender can be rate-limited.
- `/admin` is separate from the shop. A user must verify an email OTP and be listed in `public.site_admins`; a correct OTP alone does not grant admin access. The database RLS policies are the security boundary.

A Supabase project and real seller/catalogue information are required for a live store. This app links customers to each seller’s checkout; it does not take payment or independently verify the seller-site purchase.

## Product imagery

The preview uses generated, unbranded sample lifestyle/product imagery in `public/` and `public/products/`. Replace these with each seller’s authorized images before launch. For product records, use a secure `https://` image URL.
