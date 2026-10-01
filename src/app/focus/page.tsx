import type {Metadata} from "next";
import FocusScreen from "@/components/focus/FocusScreen";

export const metadata: Metadata = {
    title: "Focus · Schedula",
};

export default function FocusPage() {
    return <FocusScreen/>;
}
