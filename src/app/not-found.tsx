'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900">
      <div className="max-w-2xl mx-auto px-8 text-center">
        {/* Animated Logo/Icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            {/* FireFly glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>

            {/* Main icon */}
            <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-8 shadow-2xl">
              <svg
                className="w-24 h-24 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* FireFly Analytics Branding */}
        <div className="mb-8">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            404
          </h1>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Page Not Found
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Looks like this firefly flew away into the night
          </p>
        </div>

        {/* Description */}
        <div className="mb-10 max-w-md mx-auto">
          <p className="text-gray-600 dark:text-gray-400">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Let&apos;s get you back on track with FireFly Analytics.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/"
            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Go to Home
          </Link>

          <button
            onClick={() => router.back()}
            className="px-8 py-4 bg-white dark:bg-gray-800 border-2 border-purple-200 dark:border-purple-800 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:border-purple-400 dark:hover:border-purple-600 hover:scale-105 transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Go Back
          </button>
        </div>

        {/* Decorative Elements */}
        <div className="mt-16 flex justify-center gap-8 opacity-40">
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-sm text-gray-500 dark:text-gray-600">
          <p>
            Powered by{' '}
            <span className="font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              FireFly Analytics
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
