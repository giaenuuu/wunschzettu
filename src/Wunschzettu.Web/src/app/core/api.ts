import type { components } from '../../api/schema';

// Generated from the backend's OpenAPI document: `dotnet build` the API, then `npm run api:types`.
type Schemas = components['schemas'];

export type Me = Schemas['MeDto'];
export type IdentifyResponse = Schemas['IdentifyResponse'];
export type Dashboard = Schemas['DashboardDto'];
export type WishlistSummary = Schemas['WishlistSummaryDto'];
export type WishlistDetail = Schemas['WishlistDetailDto'];
export type SharedList = Schemas['SharedListDto'];
export type CreateWishlistRequest = Schemas['CreateWishlistRequest'];
export type UpdateWishlistRequest = Schemas['UpdateWishlistRequest'];
export type Theme = Schemas['ThemeDto'];
export type Palette = Schemas['Palette'];
export type Wish = Schemas['WishDto'];
export type WishImage = Schemas['WishImageDto'];
export type WishRequest = Schemas['WishRequest'];
export type WishLink = Schemas['WishLinkDto'];
export type ShareToken = Schemas['ShareTokenDto'];
export type Availability = Schemas['AvailabilityDto'];
export type WishAvailability = Schemas['WishAvailabilityDto'];
export type MyGift = Schemas['MyGiftDto'];
export type MyGiftSummary = Schemas['MyGiftSummaryDto'];
export type Participant = Schemas['ParticipantDto'];
export type CreateGiftRequest = Schemas['CreateGiftRequest'];
export type ParticipateRequest = Schemas['ParticipateRequest'];
export type GiftRef = Schemas['GiftRefDto'];
export type WishGifts = Schemas['WishGiftsDto'];
export type Gift = Schemas['GiftDto'];
export type ThanksEntry = Schemas['ThanksEntryDto'];
export type Member = Schemas['MemberDto'];
export type MemberRole = Schemas['MemberRole'];
export type InviteLinkRole = Schemas['InviteLinkRole'];
export type InviteLink = Schemas['InviteLinkDto'];
export type CreatedInviteLink = Schemas['CreatedInviteLinkDto'];
export type InvitePeek = Schemas['InvitePeekDto'];
export type AcceptInviteResponse = Schemas['AcceptInviteResponse'];
export type WishLinkRequest = Schemas['WishLinkRequest'];
export type LinkKind = Schemas['LinkKind'];
export type LinkPreview = Schemas['LinkPreviewDto'];
export type ScrapeResult = Schemas['ScrapeResultDto'];
export type ListAccess = Schemas['ListAccess'];

/** GET /api/legal: the operator from App:Operator, shown in Impressum and Datenschutz. */
export interface LegalInfo {
  operatorName: string | null;
  operatorEmail: string | null;
  operatorAddress: string | null;
}
