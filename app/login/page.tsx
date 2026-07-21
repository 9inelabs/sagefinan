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
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-[480px] px-6">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt=""
            className="w-[64px] h-[64px] min-[480px]:w-[72px] min-[480px]:h-[72px] object-contain shrink-0 mb-6"
          />
          <h1 className="text-[32px] min-[480px]:text-[40px] font-bold text-[#111827] leading-[1.1] mb-2">
            sagefinan
          </h1>
          <p className="text-[18px] min-[480px]:text-[22px] font-semibold text-[#5C7A5E] mb-10">
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
            className="block w-full h-[64px] rounded-[32px] bg-[#F2F2F2] border-0 px-[28px] text-[17px] text-[#111827] placeholder:text-[#9CA3AF] mb-4 focus:outline-none focus:ring-2 focus:ring-[#5C7A5E]"
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
            className="block w-full h-[64px] rounded-[32px] bg-[#F2F2F2] border-0 px-[28px] text-[17px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#5C7A5E]"
          />

          {error ? (
            <p className="text-sm text-[#B42318] text-center mt-4 mb-0" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6">
            <SubmitButton />
          </div>

          <p className="text-center text-[12px] text-[#111827] mt-3">
            This area is monitored by the Auditor.
          </p>
        </form>
      </div>
    </div>
  );
}
