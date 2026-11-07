"use client"

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/** Dark bottom-center toast, like the prototype's `.toast`. Light theme only (no next-themes). */
const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "#14213a",
          "--normal-text": "#ffffff",
          "--normal-border": "#14213a",
          "--border-radius": "9px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
