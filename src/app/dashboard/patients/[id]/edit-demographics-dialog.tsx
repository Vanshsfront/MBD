"use client";

// Edit demographics — covers the fields the FO most often needs to correct
// after intake (phone typo, address, emergency contact). Anything more
// structural (dob, sex) is editable too. Sends PATCH /api/clients/[id].
//
// Closes the FO papercut flagged as C10 in the production-evening audit.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/error-messages";

interface InitialClient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  dob: string | null; // ISO yyyy-mm-dd or null
  age: number | null;
  sex: string | null;
  occupation: string | null;
  sport: string | null;
  maritalStatus: string | null;
  address: { line1?: string; line2?: string; city?: string; pincode?: string } | null;
  emergencyContact: { name?: string; phone?: string; relationship?: string } | null;
}

export function EditDemographicsDialog({ client }: { client: InitialClient }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const [firstName, setFirstName] = useState(client.firstName);
  const [lastName, setLastName] = useState(client.lastName);
  const [phone, setPhone] = useState(client.phone);
  const [email, setEmail] = useState(client.email ?? "");
  const [dob, setDob] = useState(client.dob ?? "");
  const [age, setAge] = useState(client.age?.toString() ?? "");
  const [sex, setSex] = useState(client.sex ?? "");
  const [occupation, setOccupation] = useState(client.occupation ?? "");
  const [sport, setSport] = useState(client.sport ?? "");
  const [maritalStatus, setMaritalStatus] = useState(client.maritalStatus ?? "");
  const [addrLine1, setAddrLine1] = useState(client.address?.line1 ?? "");
  const [addrCity, setAddrCity] = useState(client.address?.city ?? "");
  const [addrPincode, setAddrPincode] = useState(client.address?.pincode ?? "");
  const [emName, setEmName] = useState(client.emergencyContact?.name ?? "");
  const [emPhone, setEmPhone] = useState(client.emergencyContact?.phone ?? "");
  const [emRelationship, setEmRelationship] = useState(
    client.emergencyContact?.relationship ?? "",
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      toast.error("Name and phone are required.");
      return;
    }
    setPending(true);
    try {
      const ageNum = age.trim() ? Number(age) : null;
      const payload: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        dob: dob ? new Date(dob).toISOString() : null,
        age: ageNum != null && Number.isFinite(ageNum) ? ageNum : null,
        sex: sex.trim() || null,
        occupation: occupation.trim() || null,
        sport: sport.trim() || null,
        maritalStatus: maritalStatus.trim() || null,
        address:
          addrLine1.trim() || addrCity.trim() || addrPincode.trim()
            ? {
                line1: addrLine1.trim() || null,
                city: addrCity.trim() || null,
                pincode: addrPincode.trim() || null,
              }
            : null,
        emergencyContact:
          emName.trim() || emPhone.trim() || emRelationship.trim()
            ? {
                name: emName.trim() || null,
                phone: emPhone.trim() || null,
                relationship: emRelationship.trim() || null,
              }
            : null,
      };
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't save changes." }));
      }
      toast.success("Demographics updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit demographics
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit demographics</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="first-name" label="First name *">
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </Field>
            <Field id="last-name" label="Last name *">
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </Field>
            <Field id="phone" label="Phone *">
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>
            <Field id="email" label="Email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field id="dob" label="Date of birth">
              <Input
                id="dob"
                type="date"
                value={dob.slice(0, 10)}
                onChange={(e) => setDob(e.target.value)}
              />
            </Field>
            <Field id="age" label="Age">
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={0}
                max={150}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </Field>
            <Field id="sex" label="Sex">
              <Input
                id="sex"
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                placeholder="M / F / Other"
              />
            </Field>
            <Field id="marital" label="Marital status">
              <Input
                id="marital"
                value={maritalStatus}
                onChange={(e) => setMaritalStatus(e.target.value)}
              />
            </Field>
            <Field id="occupation" label="Occupation">
              <Input
                id="occupation"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
              />
            </Field>
            <Field id="sport" label="Sport / activity">
              <Input
                id="sport"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
              />
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Address</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="addr-line1" label="Line 1" className="sm:col-span-2">
                <Input
                  id="addr-line1"
                  value={addrLine1}
                  onChange={(e) => setAddrLine1(e.target.value)}
                />
              </Field>
              <Field id="addr-city" label="City">
                <Input
                  id="addr-city"
                  value={addrCity}
                  onChange={(e) => setAddrCity(e.target.value)}
                />
              </Field>
              <Field id="addr-pincode" label="Pincode">
                <Input
                  id="addr-pincode"
                  inputMode="numeric"
                  value={addrPincode}
                  onChange={(e) => setAddrPincode(e.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Emergency contact</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="em-name" label="Name">
                <Input
                  id="em-name"
                  value={emName}
                  onChange={(e) => setEmName(e.target.value)}
                />
              </Field>
              <Field id="em-phone" label="Phone">
                <Input
                  id="em-phone"
                  type="tel"
                  inputMode="tel"
                  value={emPhone}
                  onChange={(e) => setEmPhone(e.target.value)}
                />
              </Field>
              <Field id="em-rel" label="Relationship">
                <Input
                  id="em-rel"
                  value={emRelationship}
                  onChange={(e) => setEmRelationship(e.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
