import type {
  CleanupExpiredResourceTicketsRequest,
  ResourceTicketCleanupReceipt
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export class ResourceMaintenanceCommands {
  constructor(private readonly storage: CoreStore) {}

  async cleanupExpiredResourceTickets(
    request: CleanupExpiredResourceTicketsRequest
  ): Promise<ResourceTicketCleanupReceipt> {
    if (request.limit !== undefined && request.limit <= 0) {
      throw new Error("resource cleanup limit must be positive")
    }
    return await this.storage.cleanupExpiredResourceTickets(request)
  }
}
