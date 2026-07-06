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
