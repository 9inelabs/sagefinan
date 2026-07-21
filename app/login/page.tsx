import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-n100 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <div className="w-6.5 h-6.5 rounded bg-teal grid place-items-center text-white text-sm font-medium">
            S
          </div>
          <div>
            <b className="block text-base font-medium tracking-tight text-ink">Sagefinan</b>
            <span className="block text-xs text-n400 -mt-0.5">Grand Hotel</span>
          </div>
        </div>

        <div className="bg-white border border-n200 rounded">
          <div className="border-b border-n200 px-4 py-3">
            <h1 className="text-base font-medium text-ink">Sign in</h1>
            <p className="text-xs text-n600 mt-0.5">Daily stock audit</p>
          </div>

          <form action={signIn} className="p-4">
            {error ? (
              <div className="text-xs text-n600 bg-n50 border border-n200 rounded px-3 py-2.5 mb-4">
                {error}
              </div>
            ) : null}

            <label className="text-xs text-n600" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full mt-1 mb-3 px-3 py-2 text-sm border border-n200 rounded focus:outline focus:outline-2 focus:outline-teal focus:-outline-offset-1 focus:border-teal"
            />

            <label className="text-xs text-n600" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full mt-1 mb-4 px-3 py-2 text-sm border border-n200 rounded focus:outline focus:outline-2 focus:outline-teal focus:-outline-offset-1 focus:border-teal"
            />

            <button
              type="submit"
              className="w-full h-12 rounded bg-teal text-white text-sm font-normal hover:brightness-95"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
