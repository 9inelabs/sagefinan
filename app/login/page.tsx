import { signIn } from "./actions";
import { SubmitButton } from "./SubmitButton";

// This route intentionally uses its own visual treatment — a plain, white,
// centred page — distinct from the app's dense ink/teal/6px-radius design
// system used everywhere past login. See SPEC.md for why, and for the exact
// colours/radii recorded there so a future phase doesn't "fix" this into
// matching the rest of the app.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-[560px] py-12">
        <div className="flex flex-col items-center text-center mb-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt=""
            className="w-14 h-14 min-[480px]:w-[72px] min-[480px]:h-[72px] mb-4"
          />
          <h1 className="text-[32px] min-[480px]:text-[40px] font-bold tracking-tight text-[#111827] leading-tight">
            sagefinan
          </h1>
          <p className="text-xl min-[480px]:text-2xl font-bold text-[#5C7A5E] mt-1">
            Stock Database for De-Moon Hotel
          </p>
        </div>

        <form action={signIn}>
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Email"
            required
            className="w-full h-16 rounded-[28px] bg-[#F2F2F2] pl-7 pr-5 text-base text-[#111827] placeholder:text-[#9CA3AF] mb-4 focus:outline-none focus:ring-2 focus:ring-[#5C7A5E]"
          />

          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            required
            className="w-full h-16 rounded-[28px] bg-[#F2F2F2] pl-7 pr-5 text-base text-[#111827] placeholder:text-[#9CA3AF] mb-6 focus:outline-none focus:ring-2 focus:ring-[#5C7A5E]"
          />

          {error ? (
            <p className="text-sm text-[#B42318] text-center mb-4" role="alert">
              {error}
            </p>
          ) : null}

          <SubmitButton />

          <p className="text-center text-xs text-[#111827] mt-4">
            This area is monitored by the Auditor.
          </p>
        </form>
      </div>
    </div>
  );
}
