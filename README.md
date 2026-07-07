# 合成音評価アンケート

Google Forms 風の合成音評価サイトです。回答画面、管理者ログイン、メディア追加、集計表示、CSV 出力に対応しています。

## ローカルで使う

```sh
npm start
```

- 回答画面: http://localhost:3000
- 管理画面: http://localhost:3000/admin

初回起動時に `data/admin-password.txt` が作成され、ターミナルにも管理者パスワードが表示されます。

## Vercel で無料公開する準備

Vercel ではファイル保存が永続化されないため、回答とメディアは Supabase に保存します。

### 1. Supabase プロジェクトを作る

Supabase で新規プロジェクトを作成し、SQL Editor で以下を実行します。

```sql
create table public.samples (
  id uuid primary key,
  title text not null,
  kind text not null check (kind in ('audio', 'video')),
  url text not null,
  original_name text,
  storage_path text,
  created_at timestamptz not null default now()
);

create table public.responses (
  id uuid primary key,
  created_at timestamptz not null default now(),
  evaluator text,
  group_name text,
  answers jsonb not null
);
```

Storage で `survey-media` という public bucket を作成します。

### 2. Vercel の Environment Variables を設定する

Vercel の Project Settings で以下を追加します。

```text
ADMIN_PASSWORD=管理画面のパスワード
ADMIN_SESSION_SECRET=ランダムな長い文字列
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase の service_role key
SUPABASE_STORAGE_BUCKET=survey-media
```

`SUPABASE_SERVICE_ROLE_KEY` は公開されるフロントエンドには送られませんが、Vercel の環境変数としてだけ設定してください。

### 3. Vercel にデプロイ

GitHub にこのフォルダを push して Vercel で Import するか、Vercel CLI から deploy します。

```sh
vercel
vercel --prod
```

公開後は `/admin` からログインし、mp3 や mov を追加してください。

## Cloudflare で公開する準備

Cloudflare では以下の構成を使います。

- Cloudflare Pages: 画面の公開
- Pages Functions: `/api/...` と `/media/...`
- D1: 回答結果とメディア一覧
- R2: mp3 / mov などのメディアファイル

### 1. D1 database を作る

Cloudflare Dashboard で `Workers & Pages` → `D1 SQL Database` から database を作成します。

ローカルに Wrangler がある場合は以下でも作れます。

```sh
npx wrangler d1 create evaluation-survey
```

作成した D1 に [schema.cloudflare.sql](./schema.cloudflare.sql) を実行します。

```sh
npx wrangler d1 execute evaluation-survey --file=./schema.cloudflare.sql --remote
```

### 2. R2 bucket を作る

Cloudflare Dashboard で `R2 Object Storage` から `survey-media` という bucket を作成します。

このサイトでは `/media/...` の Pages Function 経由で R2 のファイルを配信するため、R2 bucket を public にする必要はありません。

### 3. Pages project を作る

Cloudflare Pages で GitHub repository を接続します。

設定値:

```text
Framework preset: None
Build command: なし
Build output directory: public
Root directory: /
```

### 4. Bindings と環境変数を設定する

Pages project の `Settings` → `Functions` で bindings を追加します。

```text
D1 database binding
Variable name: DB
Database: 作成した D1

R2 bucket binding
Variable name: MEDIA_BUCKET
Bucket: survey-media
```

`Settings` → `Environment variables` で以下を追加します。

```text
ADMIN_PASSWORD=管理画面ログイン用の好きなパスワード
ADMIN_SESSION_SECRET=ランダムな長い文字列
```

`ADMIN_SESSION_SECRET` は長めのランダム文字列にしてください。

```sh
openssl rand -base64 32
```

### 5. 公開後の使い方

- 回答画面: `https://あなたのサイト.pages.dev/`
- 管理画面: `https://あなたのサイト.pages.dev/admin`

管理画面でログインし、mp3 / mov を追加すると R2 に保存されます。回答結果は D1 に保存され、管理画面から確認・CSV 出力できます。

### Wrangler でローカル確認する場合

[wrangler.example.toml](./wrangler.example.toml) を `wrangler.toml` にコピーし、`database_id` を自分の D1 database ID に変更します。

```sh
cp wrangler.example.toml wrangler.toml
npx wrangler pages dev public
```
