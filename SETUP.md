# Supabase共有DBの設定手順

このアプリは、設定前はブラウザ内のlocalStorageで動きます。SupabaseのURLとanon（publishable）キーを`config.js`に入力すると、同じSupabaseプロジェクトを使う複数人で在庫・履歴・品番カウンタを共有できます。

## 1. Supabaseプロジェクトを作成

1. [Supabase](https://supabase.com/)にログイン
2. New projectを作成
3. Project Settings → APIを開く
4. Project URLと、ブラウザ公開用のanon / publishable keyを確認

サービスロールキー（service_role）はブラウザに貼り付けないでください。

## 2. テーブルを作成

SupabaseのSQL Editorで、以下を実行します。

```sql
create table if not exists public.inventory_products (
  id text primary key,
  code text not null unique,
  name text not null,
  location text not null,
  quantity integer not null default 0 check (quantity >= 0),
  reorder_point integer not null default 0 check (reorder_point >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_history (
  id text primary key,
  product_id text not null,
  date timestamptz not null default now(),
  type text not null check (type in ('入庫', '出庫')),
  quantity integer not null check (quantity > 0),
  operator text not null,
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_settings (
  id text primary key,
  prefix text not null default 'ITEM',
  digits integer not null default 4 check (digits between 3 and 6),
  next_number integer not null default 1 check (next_number > 0),
  counters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists inventory_history_product_id_idx
  on public.inventory_history(product_id);

alter table public.inventory_products enable row level security;
alter table public.inventory_history enable row level security;
alter table public.inventory_settings enable row level security;

-- デモ／社内限定で、ログインなしの共有を許可する場合の例
create policy "inventory products public access"
  on public.inventory_products for all to anon, authenticated
  using (true) with check (true);

create policy "inventory history public access"
  on public.inventory_history for all to anon, authenticated
  using (true) with check (true);

create policy "inventory settings public access"
  on public.inventory_settings for all to anon, authenticated
  using (true) with check (true);
```

上記の公開ポリシーは、anon keyを知る人がデータを読み書きできる構成です。社外公開や本番運用では、Supabase Authのログインを追加し、`auth.uid()`を使うRLSポリシーへ変更してください。

## 3. Realtimeを有効化

SupabaseのSQL Editorで次を実行します。

```sql
alter publication supabase_realtime add table public.inventory_products;
alter publication supabase_realtime add table public.inventory_history;
alter publication supabase_realtime add table public.inventory_settings;
```

Realtime通知を受け取ると、他の利用者が登録・編集・削除した内容を自動的に再取得します。

## 4. config.jsにキーを設定

同梱の`config.js`を編集します。

```javascript
window.INVENTORY_CONFIG = {
  supabaseUrl: "https://あなたのプロジェクトID.supabase.co",
  supabaseAnonKey: "あなたのanonまたはpublishable key",
  enableRealtime: true
};
```

`service_role`キーは絶対に使用しないでください。GitHubリポジトリをPublicにする場合、anon keyは公開されます。RLSを必ず設定し、機密情報をこのアプリに保存しないでください。

## 5. GitHub Pagesへ再アップロード

`index.html`、`app.js`、`style.css`、`config.js`、`storage.js`、`README.md`、`SETUP.md`をリポジトリのトップ階層にアップロードします。

`index.html`はSupabase CDN、`config.js`、`storage.js`、`app.js`の順で読み込むため、ファイル名と配置を変更しないでください。

## 動作モード

- `config.js`のURLまたはキーが空欄：localStorageモード
- URLとanon keyの両方を設定：Supabase共有DBモード
- Supabaseへの接続に失敗：ローカル保存へフォールバックし、画面上部にエラー表示
- 複数人の同時編集：最後に保存された更新が反映されるシンプルなlast-write-wins方式
- 商品削除：商品と関連履歴を同じ保存処理で削除

## Firebaseを使う場合

Firebaseでも実装できますが、Firebase SDKの追加、Firestoreのセキュリティルール、認証、Realtime Listenerへの置き換えが必要です。今回の構成は、SQLでテーブルとRLSを管理でき、既存のlocalStorageから移行しやすいSupabaseを採用しています。
