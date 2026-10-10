using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wunschzettu.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WishGtin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Gtin",
                table: "Wishes",
                type: "TEXT",
                maxLength: 14,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Gtin",
                table: "Wishes");
        }
    }
}
